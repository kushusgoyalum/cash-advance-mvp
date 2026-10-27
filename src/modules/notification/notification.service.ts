import type { Notification } from '@prisma/mysql-client';
import { BUSINESS, type DomainEventMessage, logger } from '@common/index.js';
import { getMessagingProvider, getPlatformClient, getPushProvider } from '@modules/thirdParty/index.js';
import * as repo from './notification.repo.js';
import { type Channel, EVENT_TEMPLATES, templateIdFor } from './templates.js';

const MAX_ATTEMPTS = 5;
const log = logger.child({ module: 'notification' });

const istHHMM = (d: Date): string => new Date(d.getTime() + 330 * 60_000).toISOString().slice(11, 16);
export const isWithinContactWindow = (now: Date = new Date()): boolean => {
  const t = istHHMM(now);
  return t >= BUSINESS.CONTACT_WINDOW_IST.from && t < BUSINESS.CONTACT_WINDOW_IST.to;
};

const rupees = (paise: unknown): string => (typeof paise === 'string' ? `₹${(Number(paise) / 100).toFixed(2)}` : '');

const toVariables = (p: Record<string, unknown>): Record<string, string> => ({
  ...(p.amount ? { amount: rupees(p.amount) } : {}),
  ...(p.outstanding ? { outstanding: rupees(p.outstanding) } : {}),
  ...(p.collected ? { collected: rupees(p.collected) } : {}),
  ...(p.dueDate ? { dueDate: String(p.dueDate) } : {}),
  ...(p.daysToDue !== undefined ? { daysToDue: String(p.daysToDue) } : {}),
  ...(p.daysOverdue !== undefined ? { daysOverdue: String(p.daysOverdue) } : {}),
});

/**
 * Consumer of domain events (NOTIFICATION queue). Creates one row per channel with a
 * dedupe key (event:advance:channel[:suffix]) and sends it. Provider outages never block
 * the money flow — rows stay PENDING and are retried; the app status is always correct.
 */
export const handleDomainEvent = async (msg: DomainEventMessage): Promise<void> => {
  const tpl = EVENT_TEMPLATES[msg.type];
  const userId = msg.payload.userId;
  if (!tpl || typeof userId !== 'string') return;
  const suffix = typeof msg.payload.dedupeSuffix === 'string' ? `:${msg.payload.dedupeSuffix}` : '';

  for (const channel of tpl.channels) {
    const row = await repo.createIfAbsent({
      userId: BigInt(userId),
      advanceId: BigInt(msg.aggregateId),
      eventType: msg.type,
      channel,
      templateId: templateIdFor(msg.type, channel),
      dedupeKey: `${msg.type}:${msg.aggregateId}:${channel}${suffix}`,
      variables: toVariables(msg.payload),
    });
    if (row) await sendNotification(row);
  }
};

export const sendNotification = async (row: Notification): Promise<void> => {
  const tpl = EVENT_TEMPLATES[row.eventType as keyof typeof EVENT_TEMPLATES];
  if (tpl?.contactWindow && !isWithinContactWindow()) return; // stays PENDING; retried in-window
  const variables = (row.variables ?? {}) as Record<string, string>;
  try {
    let providerMsgId: string;
    if (row.channel === 'PUSH') {
      ({ providerMsgId } = await getPushProvider().sendPush({ userId: row.userId.toString(), templateId: row.templateId, variables }));
    } else {
      const contact = await getPlatformClient().getUserContact(row.userId.toString());
      const messaging = getMessagingProvider();
      if (row.channel === 'EMAIL') {
        if (!contact.email) return void (await repo.update(row.id, { status: 'FAILED', lastError: 'NO_EMAIL' }));
        ({ providerMsgId } = await messaging.sendEmail({ to: contact.email, templateId: row.templateId, variables, subject: tpl?.subject ?? 'Cash advance' }));
      } else if (row.channel === 'SMS') {
        ({ providerMsgId } = await messaging.sendSms({ to: contact.mobile, templateId: row.templateId, variables }));
      } else {
        ({ providerMsgId } = await messaging.sendWhatsapp({ to: contact.mobile, templateId: row.templateId, variables }));
      }
    }
    await repo.update(row.id, { status: 'SENT', providerMsgId, attempts: { increment: 1 } });
  } catch (err) {
    const attempts = row.attempts + 1;
    const exhausted = attempts >= MAX_ATTEMPTS;
    await repo.update(row.id, { attempts, lastError: String(err).slice(0, 250), ...(exhausted ? { status: 'FAILED' } : {}) });
    if (exhausted && tpl?.critical && row.channel === 'PUSH') await fallback(row, 'WHATSAPP');
    log.warn({ err: String(err), id: row.id.toString(), attempts }, 'notification send failed');
  }
};

const fallback = async (row: Notification, channel: Channel): Promise<void> => {
  const fb = await repo.createIfAbsent({
    userId: row.userId,
    advanceId: row.advanceId,
    eventType: row.eventType,
    channel,
    templateId: templateIdFor(row.eventType, channel),
    dedupeKey: `${row.dedupeKey}:fallback`,
    variables: (row.variables ?? {}) as object,
  });
  if (fb) await sendNotification(fb);
};

/** Job (every 10 min): PENDING rows with backoff by attempt count (≈5 tries over ~1h). */
export const retryPendingNotifications = async (now: Date = new Date()): Promise<number> => {
  const rows = await repo.findRetryable(new Date(now.getTime() - 5 * 60_000), MAX_ATTEMPTS, 500);
  for (const r of rows) await sendNotification(r);
  return rows.length;
};

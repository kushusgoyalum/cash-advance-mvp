import { logger, publishMessage, QueueName } from '@common/index.js';
import { applyDebitWebhook, onCreditReceived } from '@modules/collection/index.js';
import { applyPayoutWebhook } from '@modules/disbursement/index.js';
import * as repo from './webhooks.repo.js';

export interface WebhookMessage {
  inboxId: string;
}

interface BankEventData {
  clientRef?: string;
  status?: string;
  utr?: string;
  providerRef?: string;
  failureCode?: string;
  amount?: string;
  userId?: string;
}

/** Persist first, ack fast (200), process asynchronously from the WEBHOOK queue. */
export const ingestBankWebhook = async (event: { eventId: string; eventType: string; data: Record<string, unknown> }) => {
  const row = await repo.insertInbox({ provider: 'bank', providerEventId: event.eventId, eventType: event.eventType, payload: event.data });
  if (!row) return { duplicate: true };
  // If this publish fails the inbox sweeper republishes RECEIVED rows after 2 minutes.
  await publishMessage(QueueName.WEBHOOK, { inboxId: row.id } satisfies WebhookMessage).catch((err: unknown) =>
    logger.warn({ err }, 'webhook enqueue failed; sweeper will retry'),
  );
  return { duplicate: false };
};

/** Worker: dispatch to the owning module. Every target handler is idempotent. */
export const processInboxEvent = async (inboxId: string): Promise<void> => {
  const row = await repo.findInbox(inboxId);
  if (!row || row.status === 'PROCESSED') return;
  const d = row.payload as BankEventData;
  try {
    switch (row.eventType) {
      case 'PAYOUT_STATUS':
        if (d.clientRef && d.status) await applyPayoutWebhook({ clientRef: d.clientRef, status: d.status, utr: d.utr, providerRef: d.providerRef, failureCode: d.failureCode });
        break;
      case 'DEBIT_STATUS':
        if (d.clientRef && d.status) {
          await applyDebitWebhook({ clientRef: d.clientRef, status: d.status, debitedPaise: d.amount ? BigInt(d.amount) : undefined, failureCode: d.failureCode });
        }
        break;
      case 'CREDIT_RECEIVED':
        if (d.userId) await onCreditReceived(BigInt(d.userId));
        break;
      default:
        logger.info({ eventType: row.eventType }, 'ignored webhook type');
    }
    await repo.markInbox(row.id, { status: 'PROCESSED', processedAt: new Date() });
  } catch (err) {
    await repo.markInbox(row.id, { status: 'RECEIVED', attempts: { increment: 1 }, failureReason: String(err).slice(0, 250) });
    throw err; // SQS redelivers with backoff; DLQ after 5
  }
};

/** Job (every 5 min): re-enqueue inbox rows that were persisted but never processed. */
export const sweepWebhookInbox = async (now: Date = new Date()): Promise<number> => {
  const rows = await repo.findUnprocessed(new Date(now.getTime() - 2 * 60_000), 200);
  for (const r of rows) await publishMessage(QueueName.WEBHOOK, { inboxId: r.id } satisfies WebhookMessage);
  return rows.length;
};

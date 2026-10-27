import type { CollectionAttempt } from '@prisma/mysql-client';
import {
  acquireRateToken,
  addDays,
  collectionRef,
  daysBetween,
  DomainEvents,
  emitEvent,
  env,
  fromDateOnly,
  isPaused,
  istBusinessDate,
  istInstant,
  KillSwitch,
  logger,
  ProviderError,
  publishMessage,
  QueueName,
  toDateOnly,
} from '@common/index.js';
import { runTransactional } from '@database/index.js';
import {
  getAdvanceById,
  lockAdvanceForUpdate,
  transitionAdvance,
  updateAdvanceInStatus,
} from '@modules/application/index.js';
import type { Actor } from '@modules/audit/index.js';
import { postRepayment } from '@modules/ledger/index.js';
import { getBankingProvider, getPlatformClient, isBankAvailable } from '@modules/thirdParty/index.js';
import * as repo from './collection.repo.js';
import {
  allocateFeeFirst,
  creditTriggeredSeq,
  isOverdueReminderDay,
  planDebit,
  slotsForDate,
  statusAfterCollection,
} from './collection.utils.js';

const SYSTEM: Actor = { type: 'SYSTEM', id: 'collection-worker' };
const log = logger.child({ module: 'collection' });

export interface CollectMessage {
  attemptId: string;
}

/** Planner (daily 06:30 IST): writes today's attempts for every repayable advance. Idempotent. */
export const planCollectionsForDate = async (businessDate: string): Promise<number> => {
  const from = toDateOnly(addDays(businessDate, -30));
  const to = toDateOnly(businessDate);
  let cursor = 0n;
  let planned = 0;
  for (;;) {
    const batch = await repo.findRepayableDueBetween(from, to, cursor, 1_000); // keyset pagination
    if (batch.length === 0) break;
    const rows = batch.flatMap((a) =>
      a.dueDate
        ? slotsForDate(fromDateOnly(a.dueDate), businessDate).map((s) => ({
            advanceId: a.id,
            attemptSeq: s.seq,
            scheduledFor: istInstant(s.businessDate, s.time),
            clientRef: collectionRef(a.id, s.seq),
            channel: 'ACCOUNT_DEBIT' as const,
          }))
        : [],
    );
    planned += await repo.createAttempts(rows);
    cursor = batch.at(-1)?.id ?? cursor;
  }
  return planned;
};

/** Dispatcher (every 5 min): claims due attempts and enqueues them for the collection workers. */
export const dispatchDueAttempts = async (now: Date = new Date()): Promise<number> => {
  if (await isPaused(KillSwitch.COLLECTIONS)) return 0;
  const claimed = await repo.claimDueAttempts(now, 500);
  for (const id of claimed) {
    try {
      await publishMessage(QueueName.COLLECTION, { attemptId: id.toString() } satisfies CollectMessage);
    } catch (err) {
      log.error({ err }, 'enqueue failed; reverting attempt to PLANNED');
      await repo.updateAttempt(id, { status: 'PLANNED' });
    }
  }
  return claimed.length;
};

/**
 * Collection worker: balance check → debit min(balance, outstanding) with clientRef
 * COL-{advanceId}-{seq} as the bank idempotency key. Always queries the debit status first,
 * so a redelivered message can never debit twice.
 */
export const executeAttempt = async (attemptId: bigint): Promise<void> => {
  const attempt = await repo.findAttempt(attemptId);
  if (!attempt || attempt.status !== 'IN_PROGRESS') return;

  if (!isBankAvailable()) {
    await repo.updateAttempt(attempt.id, { status: 'SKIPPED_OUTAGE', failureReason: 'BANK_CIRCUIT_OPEN' });
    return; // never mark a user overdue because of OUR provider outage
  }

  const advance = await getAdvanceById(attempt.advanceId);
  const outstanding = advance.totalRepayablePaise - advance.collectedPaise;
  if (outstanding <= 0n || advance.status === 'REPAID') {
    await repo.updateAttempt(attempt.id, { status: 'FAILED', failureReason: 'ALREADY_REPAID' });
    return;
  }

  const bank = getBankingProvider();
  try {
    await acquireRateToken('bank', env.BANK_PROVIDER_TPS);
    const prior = await bank.getDebitStatus(attempt.clientRef);
    if (prior.status === 'SUCCESS') return await applyDebitSuccess(attempt.id, prior.debitedPaise ?? attempt.requestedPaise);
    if (prior.status === 'PENDING') return; // webhook / sweeper will resolve it

    const profile = await getPlatformClient().getUserProfile(advance.userId.toString());
    const balance = await bank.getAccountBalance(profile.accountRef);
    const plan = planDebit(balance, outstanding);
    if (plan.action === 'NONE') {
      await repo.updateAttempt(attempt.id, { status: 'NO_FUNDS', requestedPaise: 0n });
      return;
    }

    // Persist the amount BEFORE calling the bank: this clientRef now always means this amount.
    await repo.updateAttempt(attempt.id, { requestedPaise: plan.amountPaise });
    const consentRef = (advance.consents as { consentRef?: string } | null)?.consentRef ?? `CNS-${advance.publicId}`;
    await acquireRateToken('bank', env.BANK_PROVIDER_TPS);
    const result = await bank.debitAccount({ clientRef: attempt.clientRef, userAccountRef: profile.accountRef, amountPaise: plan.amountPaise, consentRef });

    if (result.status === 'SUCCESS') return await applyDebitSuccess(attempt.id, result.debitedPaise ?? plan.amountPaise);
    if (result.status === 'FAILED') {
      const noFunds = result.failureCode === 'INSUFFICIENT_FUNDS';
      await repo.updateAttempt(attempt.id, { status: noFunds ? 'NO_FUNDS' : 'FAILED', failureReason: result.failureCode ?? 'DEBIT_FAILED' });
      if (!noFunds) log.warn({ advanceId: advance.id.toString(), code: result.failureCode }, 'debit failed — ops attention');
      return;
    }
    // PENDING → stays IN_PROGRESS; resolved by webhook or the stuck-attempt sweeper.
  } catch (err) {
    if (!(err instanceof ProviderError)) throw err;
    if (err.kind === 'CIRCUIT_OPEN') {
      await repo.updateAttempt(attempt.id, { status: 'SKIPPED_OUTAGE', failureReason: err.message });
      return;
    }
    // Unknown outcome → leave IN_PROGRESS; the sweeper queries status by clientRef.
    log.warn({ err: err.message, attemptId: attempt.id.toString() }, 'debit outcome unknown');
  }
};

/**
 * Applies a confirmed debit: row lock on the advance, fee-first allocation, ledger, status.
 * Idempotent: an attempt already SUCCESS/PARTIAL is ignored (webhook + poll can both arrive).
 */
export const applyDebitSuccess = async (attemptId: bigint, debitedPaise: bigint): Promise<void> => {
  await runTransactional(async () => {
    const attempt = await repo.findAttempt(attemptId);
    if (!attempt) return;
    await lockAdvanceForUpdate(attempt.advanceId);
    const fresh = await repo.findAttempt(attemptId);
    if (!fresh || fresh.status === 'SUCCESS' || fresh.status === 'PARTIAL') return;

    const advance = await getAdvanceById(attempt.advanceId);
    const feeOutstanding = advance.feePaise - advance.feeCollectedPaise;
    const principalCollected = advance.collectedPaise - advance.feeCollectedPaise;
    const principalOutstanding = advance.principalPaise - principalCollected;
    const { feePart, principalPart, excess } = allocateFeeFirst(debitedPaise, feeOutstanding, principalOutstanding);
    if (excess > 0n) log.error({ advanceId: advance.id.toString(), excess: excess.toString() }, 'over-collection — refund via ops');

    await postRepayment({ advanceId: advance.id, reference: attempt.clientRef, feePart, principalPart });
    const collected = advance.collectedPaise + feePart + principalPart;
    const outstandingAfter = advance.totalRepayablePaise - collected;
    await repo.updateAttempt(attempt.id, { status: outstandingAfter === 0n ? 'SUCCESS' : 'PARTIAL', collectedPaise: debitedPaise });

    const next = statusAfterCollection(advance.status, outstandingAfter);
    const data = {
      collectedPaise: collected,
      feeCollectedPaise: advance.feeCollectedPaise + feePart,
      ...(next === 'REPAID' ? { closedAt: new Date() } : {}),
    };
    const event = {
      type: outstandingAfter === 0n ? DomainEvents.REPAYMENT_SUCCEEDED : DomainEvents.REPAYMENT_PARTIAL,
      payload: { collected: debitedPaise.toString(), outstanding: outstandingAfter.toString(), clientRef: attempt.clientRef },
    };
    if (next !== advance.status) {
      await transitionAdvance({ advanceId: advance.id, from: advance.status, to: next, actor: SYSTEM, data, event });
    } else {
      await updateAdvanceInStatus({ advanceId: advance.id, from: advance.status, actor: SYSTEM, data, event });
    }
  });
};

/** Bank webhook DEBIT_STATUS → same paths as polling. */
export const applyDebitWebhook = async (p: { clientRef: string; status: string; debitedPaise?: bigint | undefined; failureCode?: string | undefined }) => {
  const attempt = await repo.findAttemptByClientRef(p.clientRef);
  if (!attempt) return;
  if (p.status === 'SUCCESS') await applyDebitSuccess(attempt.id, p.debitedPaise ?? attempt.requestedPaise);
  else if (p.status === 'FAILED' && attempt.status === 'IN_PROGRESS') {
    await repo.updateAttempt(attempt.id, { status: p.failureCode === 'INSUFFICIENT_FUNDS' ? 'NO_FUNDS' : 'FAILED', failureReason: p.failureCode ?? null });
  }
};

/** Bank webhook CREDIT_RECEIVED (e.g. salary) → one early attempt per day for past-due advances. */
export const onCreditReceived = async (userId: bigint, now: Date = new Date()): Promise<number> => {
  const today = istBusinessDate(now);
  const advances = await repo.findRepayableForUser(userId);
  let created = 0;
  for (const a of advances) {
    if (!a.dueDate || fromDateOnly(a.dueDate) > today) continue;
    const seq = creditTriggeredSeq(fromDateOnly(a.dueDate), today);
    created += await repo.createAttempts([{ advanceId: a.id, attemptSeq: seq, scheduledFor: now, clientRef: collectionRef(a.id, seq), channel: 'ACCOUNT_DEBIT' }]);
  }
  if (created > 0) await dispatchDueAttempts(now);
  return created;
};

/**
 * End of due date (23:55 IST): DISBURSED / PARTIALLY_REPAID with outstanding → OVERDUE.
 * Skipped when every attempt since the due date was blocked by a provider outage.
 */
export const markOverdue = async (businessDate: string): Promise<{ overdue: number; blockedByOutage: number }> => {
  const candidates = await repo.findToMarkOverdue(toDateOnly(businessDate), 5_000);
  let overdue = 0;
  let blockedByOutage = 0;
  for (const a of candidates) {
    if (a.totalRepayablePaise - a.collectedPaise <= 0n || !a.dueDate) continue;
    const executed = await repo.countExecutedAttemptsSince(a.id, istInstant(fromDateOnly(a.dueDate), '00:00'));
    if (executed === 0) {
      blockedByOutage += 1;
      if (!a.collectionBlockedByOutage) {
        await updateAdvanceInStatus({ advanceId: a.id, from: a.status, actor: SYSTEM, data: { collectionBlockedByOutage: true }, reason: 'COLLECTION_BLOCKED_BY_OUTAGE' }).catch(() => undefined);
      }
      continue;
    }
    try {
      await transitionAdvance({
        advanceId: a.id, from: a.status, to: 'OVERDUE', actor: SYSTEM,
        event: { type: DomainEvents.ADVANCE_OVERDUE, payload: { outstanding: (a.totalRepayablePaise - a.collectedPaise).toString(), dedupeSuffix: businessDate } },
      });
      overdue += 1;
    } catch (err) {
      log.warn({ err, advanceId: a.id.toString() }, 'overdue transition skipped (state changed)');
    }
  }
  return { overdue, blockedByOutage };
};

/** Sweeper: IN_PROGRESS for >15 min → ask the bank what happened to that clientRef. */
export const sweepStuckAttempts = async (now: Date = new Date()): Promise<number> => {
  const stuck: CollectionAttempt[] = await repo.findStuckAttempts(new Date(now.getTime() - 15 * 60_000), 200);
  const bank = getBankingProvider();
  for (const a of stuck) {
    try {
      const s = await bank.getDebitStatus(a.clientRef);
      if (s.status === 'SUCCESS') await applyDebitSuccess(a.id, s.debitedPaise ?? a.requestedPaise);
      else if (s.status === 'FAILED') await repo.updateAttempt(a.id, { status: s.failureCode === 'INSUFFICIENT_FUNDS' ? 'NO_FUNDS' : 'FAILED', failureReason: s.failureCode ?? null });
      else if (s.status === 'NOT_FOUND') await repo.updateAttempt(a.id, { status: 'PLANNED' }); // never reached the bank → re-dispatch
      else if (now.getTime() - a.updatedAt.getTime() > 2 * 3_600_000) log.error({ clientRef: a.clientRef }, 'PAGE: debit pending > 2h');
    } catch (err) {
      log.warn({ err, clientRef: a.clientRef }, 'stuck attempt status check failed');
    }
  }
  return stuck.length;
};

/** Reminder job (09:00 IST): due reminders T-3, T-1, T and overdue reminders D+1, D+3, D+7, weekly. */
export const emitRepaymentReminders = async (businessDate: string): Promise<number> => {
  let emitted = 0;
  for (const daysToDue of [3, 1, 0]) {
    for (const a of await repo.findDueOn(toDateOnly(addDays(businessDate, daysToDue)))) {
      await emitEvent({
        type: DomainEvents.REPAYMENT_DUE_REMINDER,
        aggregateType: 'cash_advance',
        aggregateId: a.id.toString(),
        payload: { advanceId: a.id.toString(), userId: a.userId.toString(), daysToDue, outstanding: (a.totalRepayablePaise - a.collectedPaise).toString(), dedupeSuffix: businessDate },
      });
      emitted += 1;
    }
  }
  let cursor = 0n;
  for (;;) {
    const batch = await repo.findOverdue(cursor, 1_000);
    if (batch.length === 0) break;
    for (const a of batch) {
      const daysOverdue = a.dueDate ? daysBetween(fromDateOnly(a.dueDate), businessDate) : 0;
      if (!isOverdueReminderDay(daysOverdue)) continue;
      await emitEvent({
        type: DomainEvents.OVERDUE_REMINDER,
        aggregateType: 'cash_advance',
        aggregateId: a.id.toString(),
        payload: { advanceId: a.id.toString(), userId: a.userId.toString(), daysOverdue, outstanding: (a.totalRepayablePaise - a.collectedPaise).toString(), dedupeSuffix: businessDate },
      });
      emitted += 1;
    }
    cursor = batch.at(-1)?.id ?? cursor;
  }
  return emitted;
};

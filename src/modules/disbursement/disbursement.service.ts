import type { Disbursement } from '@prisma/mysql-client';
import {
  acquireLock,
  acquireRateToken,
  addDays,
  AppError,
  BUSINESS,
  disbursementRef,
  DomainEvents,
  env,
  ErrorCodes,
  HttpStatus,
  isPaused,
  istBusinessDate,
  KillSwitch,
  logger,
  nextBusinessDay,
  payoutRetryDelayMs,
  ProviderError,
} from '@common/index.js';
import { getRedisClient, isUniqueConstraintError, runTransactional } from '@database/index.js';
import { getAdvanceById, transitionAdvance } from '@modules/application/index.js';
import type { Actor } from '@modules/audit/index.js';
import { postDisbursal } from '@modules/ledger/index.js';
import { getBankingProvider, getPlatformClient, type PayoutResult } from '@modules/thirdParty/index.js';
import * as repo from './disbursement.repo.js';

const SYSTEM: Actor = { type: 'SYSTEM', id: 'disbursement-worker' };
const ESCROW_BALANCE_KEY = 'bank:escrow:balance';
const log = logger.child({ module: 'disbursement' });

/** Written by the 60s bank health probe; read before starting payouts. */
export const cacheEscrowBalance = async (balancePaise: bigint): Promise<void> => {
  await getRedisClient().set(ESCROW_BALANCE_KEY, balancePaise.toString(), 'EX', 300).catch(() => undefined);
};
const getCachedEscrowBalance = async (): Promise<bigint | null> => {
  const v = await getRedisClient().get(ESCROW_BALANCE_KEY).catch(() => null);
  return v ? BigInt(v) : null;
};

/**
 * Consumer of APPLICATION_APPROVED. Creates the payout row (UNIQUE advance_id) and moves
 * APPROVED → DISBURSEMENT_PENDING in ONE transaction, then executes the payout.
 * If disbursals are paused or funds are low, the advance simply stays APPROVED and the
 * sweeper resumes it later (open business question Q4 decides the exact policy).
 */
export const startDisbursement = async (advanceId: bigint): Promise<void> => {
  const advance = await getAdvanceById(advanceId);
  if (advance.status !== 'APPROVED') return; // idempotent: cancelled, already started, ...

  if (await isPaused(KillSwitch.DISBURSEMENTS)) {
    log.warn({ advanceId: advanceId.toString() }, 'disbursements paused; will resume via sweeper');
    return;
  }
  const escrow = await getCachedEscrowBalance();
  if (escrow !== null && escrow < advance.principalPaise + BUSINESS.FUNDING_BUFFER_PAISE) {
    log.error({ escrow: escrow.toString() }, 'LOW_FUNDING_BALANCE — payout deferred (alert treasury)');
    return;
  }

  let disbursement: Disbursement;
  try {
    disbursement = await runTransactional(async () => {
      const row = await repo.createDisbursement({
        advanceId,
        clientRef: disbursementRef(advanceId, 1),
        payoutAttempt: 1,
        amountPaise: advance.principalPaise,
        status: 'INITIATED',
      });
      await transitionAdvance({
        advanceId, from: 'APPROVED', to: 'DISBURSEMENT_PENDING', actor: SYSTEM,
        event: { type: DomainEvents.DISBURSEMENT_INITIATED, payload: { clientRef: row.clientRef } },
      });
      return row;
    });
  } catch (err) {
    // Duplicate event / lost race with a user cancel: someone else already decided.
    if (isUniqueConstraintError(err) || err instanceof AppError) return;
    throw err;
  }
  await executePayout(disbursement.id);
};

/**
 * Executes (or resumes) one payout. Golden rule: if a previous call MAY have reached the bank
 * (timeout / 5xx / unknown), we QUERY STATUS by clientRef first and never blindly re-send.
 * The clientRef is also the bank's idempotency key, so even a re-send cannot pay twice.
 */
export const executePayout = async (disbursementId: bigint): Promise<void> => {
  const lock = await acquireLock(`payout:${disbursementId}`, 60_000);
  if (!lock) return; // another worker/sweeper is on it
  try {
    const d = await repo.findById(disbursementId);
    if (!d || d.status === 'SUCCESS' || d.status === 'FAILED') return;
    const bank = getBankingProvider();

    try {
      if (d.status !== 'INITIATED' || d.retryCount > 0) {
        await acquireRateToken('bank', env.BANK_PROVIDER_TPS);
        const status = await bank.getPayoutStatus(d.clientRef);
        if (status.status === 'SUCCESS') return await completeDisbursement(d, status);
        if (status.status === 'FAILED') return await failDisbursement(d, status.failureCode ?? 'PROVIDER_FAILED');
        if (status.status === 'PENDING') return await scheduleRetry(d, 'PENDING', 'awaiting provider');
        // NOT_FOUND → the bank never received it → safe to send (same clientRef).
        if (isRetryWindowOver(d)) return await failDisbursement(d, 'NOT_SENT_WITHIN_WINDOW');
      }

      const advance = await getAdvanceById(d.advanceId);
      const profile = await getPlatformClient().getUserProfile(advance.userId.toString());
      await repo.updateDisbursement(d.id, { firstTriedAt: d.firstTriedAt ?? new Date() });
      await acquireRateToken('bank', env.BANK_PROVIDER_TPS);
      const result = await bank.initiatePayout({
        clientRef: d.clientRef,
        amountPaise: d.amountPaise,
        beneficiaryAccountRef: profile.accountRef,
        narration: `Cash advance ${advance.publicId}`,
      });
      if (result.status === 'SUCCESS') return await completeDisbursement(d, result);
      if (result.status === 'FAILED') return await failDisbursement(d, result.failureCode ?? 'PROVIDER_REJECTED');
      return await scheduleRetry(d, 'PENDING', 'accepted, awaiting final status', result.providerRef);
    } catch (err) {
      if (!(err instanceof ProviderError)) throw err;
      if (!err.retryable) return await failDisbursement(d, err.providerCode ?? err.kind);
      // Outcome unknown (timeout/5xx) → UNKNOWN: next run starts with a status query.
      await scheduleRetry(d, err.outcomeUnknown ? 'UNKNOWN' : 'PENDING', err.message);
      if (isRetryWindowOver(d)) {
        log.error({ clientRef: d.clientRef }, 'PAGE: payout outcome unknown beyond 24h — needs ops');
      }
    }
  } finally {
    await lock.release();
  }
};

const isRetryWindowOver = (d: Disbursement): boolean =>
  d.firstTriedAt !== null && Date.now() - d.firstTriedAt.getTime() > BUSINESS.DISBURSEMENT_RETRY_WINDOW_HOURS * 3_600_000;

const scheduleRetry = async (d: Disbursement, status: 'PENDING' | 'UNKNOWN', reason: string, providerRef?: string): Promise<void> => {
  await repo.updateDisbursement(d.id, {
    status,
    retryCount: { increment: 1 },
    lastError: reason.slice(0, 250),
    nextRetryAt: new Date(Date.now() + payoutRetryDelayMs(d.retryCount)),
    ...(providerRef ? { providerRef } : {}),
  });
};

/** Payout confirmed: fix the due date (disbursal date + tenure), post ledger, → DISBURSED. */
const completeDisbursement = async (d: Disbursement, result: PayoutResult): Promise<void> => {
  await runTransactional(async () => {
    const advance = await getAdvanceById(d.advanceId);
    if (advance.status !== 'DISBURSEMENT_PENDING') return; // already applied (webhook + poll race)
    const dueDate = nextBusinessDay(addDays(istBusinessDate(), advance.tenureDays));
    await repo.updateDisbursement(d.id, { status: 'SUCCESS', utr: result.utr ?? null, providerRef: result.providerRef ?? d.providerRef, nextRetryAt: null });
    await postDisbursal({ advanceId: d.advanceId, reference: d.clientRef, principalPaise: advance.principalPaise, feePaise: advance.feePaise });
    await transitionAdvance({
      advanceId: d.advanceId, from: 'DISBURSEMENT_PENDING', to: 'DISBURSED', actor: SYSTEM,
      data: { disbursedAt: new Date(), dueDate: new Date(`${dueDate}T00:00:00Z`) },
      event: { type: DomainEvents.ADVANCE_DISBURSED, payload: { utr: result.utr ?? null, dueDate, amount: advance.principalPaise.toString() } },
    });
  });
};

/** Only on CONFIRMED failure — an unknown outcome never becomes FAILED. */
const failDisbursement = async (d: Disbursement, code: string): Promise<void> => {
  await runTransactional(async () => {
    const advance = await getAdvanceById(d.advanceId);
    if (advance.status !== 'DISBURSEMENT_PENDING') return;
    await repo.updateDisbursement(d.id, { status: 'FAILED', lastError: code, nextRetryAt: null });
    await transitionAdvance({
      advanceId: d.advanceId, from: 'DISBURSEMENT_PENDING', to: 'DISBURSEMENT_FAILED', actor: SYSTEM, reason: code,
      event: { type: DomainEvents.DISBURSEMENT_FAILED, payload: { code } },
    });
  });
};

/** Bank webhook (PAYOUT_STATUS) → same completion paths as polling (both idempotent). */
export const applyPayoutWebhook = async (p: { clientRef: string; status: string; utr?: string | undefined; providerRef?: string | undefined; failureCode?: string | undefined }) => {
  const d = await repo.findByClientRef(p.clientRef);
  if (!d || d.status === 'SUCCESS' || d.status === 'FAILED') return;
  if (p.status === 'SUCCESS') await completeDisbursement(d, { status: 'SUCCESS', utr: p.utr, providerRef: p.providerRef });
  else if (p.status === 'FAILED') await failDisbursement(d, p.failureCode ?? 'PROVIDER_FAILED');
};

/**
 * Ops retry (SUPERVISOR) from DISBURSEMENT_FAILED. We re-confirm with the bank first: if the
 * old attempt actually succeeded we complete it instead of paying again. A new clientRef
 * (attempt n+1) is used only after the previous one is confirmed failed / not found.
 */
export const retryFailedPayout = async (advanceId: bigint, actor: Actor, note: string): Promise<void> => {
  const d = await repo.findByAdvanceId(advanceId);
  if (!d || d.status !== 'FAILED') throw new AppError(ErrorCodes.INVALID_STATE_TRANSITION, HttpStatus.CONFLICT);
  const status = await getBankingProvider().getPayoutStatus(d.clientRef);
  if (status.status === 'SUCCESS') {
    await runTransactional(async () => {
      await transitionAdvance({ advanceId, from: 'DISBURSEMENT_FAILED', to: 'DISBURSEMENT_PENDING', actor, reason: 'PROVIDER_REPORTS_SUCCESS' });
      await repo.updateDisbursement(d.id, { status: 'PENDING' });
    });
    return executePayout(d.id);
  }
  if (status.status === 'PENDING') throw new AppError(ErrorCodes.REQUEST_IN_PROGRESS, HttpStatus.CONFLICT);

  const nextAttempt = d.payoutAttempt + 1;
  await runTransactional(async () => {
    await repo.updateDisbursement(d.id, {
      payoutAttempt: nextAttempt,
      clientRef: disbursementRef(advanceId, nextAttempt),
      status: 'INITIATED',
      retryCount: 0,
      firstTriedAt: null,
      nextRetryAt: null,
      lastError: null,
    });
    await transitionAdvance({ advanceId, from: 'DISBURSEMENT_FAILED', to: 'DISBURSEMENT_PENDING', actor, reason: note });
  });
  await executePayout(d.id);
};

/** Sweeper (every 5 min): resume due/stuck payouts and APPROVED advances without a payout. */
export const sweepPayouts = async (now: Date = new Date()): Promise<{ resumed: number; started: number }> => {
  const due = await repo.findDueForSweep(now, 200);
  for (const d of due) await executePayout(d.id).catch((err: unknown) => log.error({ err, id: d.id.toString() }, 'sweep payout failed'));
  const approved = await repo.findApprovedWithoutPayout(new Date(now.getTime() - 5 * 60_000), 200);
  for (const a of approved) await startDisbursement(a.id).catch((err: unknown) => log.error({ err }, 'resume approved failed'));
  return { resumed: due.length, started: approved.length };
};

export const getDisbursementForAdvance = (advanceId: bigint) => repo.findByAdvanceId(advanceId);

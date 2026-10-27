import type { AdvanceStatus } from '@prisma/mysql-client';
import { AppError, emitEvent, ErrorCodes, HttpStatus } from '@common/index.js';
import { runTransactional } from '@database/index.js';
import { recordAudit } from '@modules/audit/index.js';
import * as repo from './application.repo.js';
import type { CashAdvance, TransitionInput } from './application.types.js';

/**
 * SINGLE SOURCE OF TRUTH for the lifecycle (design §3.3). Anything not listed is invalid,
 * e.g. APPROVED → DISBURSED (must go through a payout record), DISBURSED → CANCELLED,
 * REJECTED → APPROVED, OVERDUE → PARTIALLY_REPAID, or any move out of a terminal state.
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<AdvanceStatus, readonly AdvanceStatus[]>> = {
  DRAFT: ['SUBMITTED', 'EXPIRED', 'CANCELLED'],
  SUBMITTED: ['APPROVED', 'REJECTED', 'UNDER_REVIEW', 'CANCELLED'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED'],
  APPROVED: ['DISBURSEMENT_PENDING', 'CANCELLED'],
  DISBURSEMENT_PENDING: ['DISBURSED', 'DISBURSEMENT_FAILED'],
  DISBURSEMENT_FAILED: ['DISBURSEMENT_PENDING', 'CANCELLED'],
  DISBURSED: ['PARTIALLY_REPAID', 'REPAID', 'OVERDUE'],
  PARTIALLY_REPAID: ['REPAID', 'OVERDUE'],
  OVERDUE: ['REPAID'],
  REPAID: [],
  REJECTED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export const TERMINAL_STATUSES: readonly AdvanceStatus[] = ['REPAID', 'REJECTED', 'CANCELLED', 'EXPIRED'];
export const USER_CANCELLABLE: readonly AdvanceStatus[] = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED'];
/** Only UNDER_REVIEW can be approved/rejected manually (SUBMITTED belongs to the auto engine). */
export const MANUALLY_ACTIONABLE: readonly AdvanceStatus[] = ['UNDER_REVIEW'];
/** Statuses in which money is out and collection applies. */
export const REPAYABLE_STATUSES: readonly AdvanceStatus[] = ['DISBURSED', 'PARTIALLY_REPAID', 'OVERDUE'];

export const canTransition = (from: AdvanceStatus, to: AdvanceStatus): boolean => ALLOWED_TRANSITIONS[from].includes(to);

export const assertTransition = (from: AdvanceStatus, to: AdvanceStatus): void => {
  if (!canTransition(from, to)) {
    throw new AppError(ErrorCodes.INVALID_STATE_TRANSITION, HttpStatus.CONFLICT, { from, to });
  }
};

const conflict = async (advanceId: bigint, input: { from: AdvanceStatus; expectedVersion?: number | undefined }): Promise<never> => {
  const current = await repo.findById(advanceId);
  if (!current) throw new AppError(ErrorCodes.NOT_FOUND, HttpStatus.NOT_FOUND);
  if (input.expectedVersion !== undefined && current.version !== input.expectedVersion) {
    throw new AppError(ErrorCodes.VERSION_CONFLICT, HttpStatus.CONFLICT, { currentVersion: current.version });
  }
  throw new AppError(ErrorCodes.INVALID_STATE_TRANSITION, HttpStatus.CONFLICT, { expected: input.from, current: current.status });
};

/**
 * The ONLY way to change an advance's status:
 *   UPDATE cash_advance SET status=:to, version=version+1, ...data
 *   WHERE id=:id AND status=:from [AND version=:expectedVersion]
 * 0 rows ⇒ someone else won the race ⇒ 409. History + audit + outbox event are written in the
 * SAME transaction, so state and events can never drift apart.
 */
export const transitionAdvance = async (input: TransitionInput): Promise<CashAdvance> => {
  assertTransition(input.from, input.to);
  return runTransactional(async () => {
    const count = await repo.conditionalUpdate(input.advanceId, input.from, input.expectedVersion, {
      ...input.data,
      status: input.to,
    });
    if (count === 0) await conflict(input.advanceId, input);

    const updated = await repo.findByIdOrThrow(input.advanceId);
    await repo.insertHistory({
      advanceId: input.advanceId,
      fromStatus: input.from,
      toStatus: input.to,
      actorType: input.actor.type,
      actorId: input.actor.id,
      reason: input.reason ?? null,
      requestId: input.requestId ?? null,
    });
    await recordAudit({
      entityType: 'cash_advance',
      entityId: input.advanceId.toString(),
      action: `STATUS_${input.to}`,
      actor: input.actor,
      before: { status: input.from },
      after: { status: input.to, version: updated.version, ...(input.data ? JSON.parse(JSON.stringify(input.data, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v))) : {}) },
      reason: input.reason,
      requestId: input.requestId,
    });
    if (input.event) {
      await emitEvent({
        type: input.event.type,
        aggregateType: 'cash_advance',
        aggregateId: input.advanceId.toString(),
        payload: { advanceId: input.advanceId.toString(), userId: updated.userId.toString(), status: input.to, ...input.event.payload },
      });
    }
    return updated;
  });
};

/**
 * Amount-only update while the status stays the same (e.g. a partial collection on an
 * OVERDUE advance). Same guard (status + version) and same audit/outbox guarantees.
 */
export const updateAdvanceInStatus = async (input: Omit<TransitionInput, 'to'>): Promise<CashAdvance> =>
  runTransactional(async () => {
    const count = await repo.conditionalUpdate(input.advanceId, input.from, input.expectedVersion, { ...input.data });
    if (count === 0) await conflict(input.advanceId, input);
    const updated = await repo.findByIdOrThrow(input.advanceId);
    await recordAudit({
      entityType: 'cash_advance',
      entityId: input.advanceId.toString(),
      action: 'AMOUNTS_UPDATED',
      actor: input.actor,
      after: JSON.parse(JSON.stringify(input.data ?? {}, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v))) as Record<string, unknown>,
      reason: input.reason,
    });
    if (input.event) {
      await emitEvent({
        type: input.event.type,
        aggregateType: 'cash_advance',
        aggregateId: input.advanceId.toString(),
        payload: { advanceId: input.advanceId.toString(), userId: updated.userId.toString(), status: updated.status, ...input.event.payload },
      });
    }
    return updated;
  });

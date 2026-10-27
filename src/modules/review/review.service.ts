import {
  AppError,
  BUSINESS,
  DomainEvents,
  ErrorCodes,
  fromDateOnly,
  hoursFromNow,
  HttpStatus,
  KillSwitch,
  logger,
  type OpsPrincipal,
  paiseToNumber,
  setPaused,
  toDateOnly,
} from '@common/index.js';
import { runTransactional } from '@database/index.js';
import {
  type AdvanceStatus,
  getAdvanceByPublicId,
  MANUALLY_ACTIONABLE,
  toAdvanceDto,
  transitionAdvance,
} from '@modules/application/index.js';
import { type Actor, getAuditTrail, recordAudit } from '@modules/audit/index.js';
import { retryFailedPayout } from '@modules/disbursement/index.js';
import * as repo from './review.repo.js';

const opsActor = (ops: OpsPrincipal): Actor => ({ type: 'OPS', id: ops.opsUserId });

const loadActionable = async (publicId: string) => {
  const advance = await getAdvanceByPublicId(publicId);
  if (!advance) throw new AppError(ErrorCodes.NOT_FOUND, HttpStatus.NOT_FOUND);
  if (!MANUALLY_ACTIONABLE.includes(advance.status)) {
    throw new AppError(ErrorCodes.INVALID_STATE_TRANSITION, HttpStatus.CONFLICT, { current: advance.status });
  }
  return advance;
};

/** Consumer of APPLICATION_REFERRED → review task with a 24h SLA (idempotent). */
export const onApplicationReferred = async (advanceId: bigint): Promise<void> => {
  await repo.createReviewTask(advanceId, hoursFromNow(BUSINESS.REVIEW_SLA_HOURS));
};

/** UNDER_REVIEW → APPROVED (REVIEWER, within approval limit, expectedVersion required). */
export const approveApplication = async (ops: OpsPrincipal, publicId: string, input: { expectedVersion: number; note: string }) => {
  const advance = await loadActionable(publicId);
  if (advance.principalPaise > ops.approvalLimitPaise) {
    throw new AppError(ErrorCodes.REVIEWER_LIMIT_EXCEEDED, HttpStatus.FORBIDDEN, { limit: paiseToNumber(ops.approvalLimitPaise) });
  }
  const updated = await runTransactional(async () => {
    const u = await transitionAdvance({
      advanceId: advance.id, from: 'UNDER_REVIEW', to: 'APPROVED', actor: opsActor(ops),
      expectedVersion: input.expectedVersion, reason: input.note,
      data: { decisionSource: 'MANUAL' },
      event: { type: DomainEvents.APPLICATION_APPROVED },
    });
    await repo.closeReviewTask(advance.id, { decision: 'APPROVE', assignee: ops.opsUserId, note: input.note, status: 'DONE' });
    return u;
  });
  return toAdvanceDto(updated);
};

/** UNDER_REVIEW → REJECTED (REVIEWER, reason code mandatory). */
export const rejectApplication = async (
  ops: OpsPrincipal,
  publicId: string,
  input: { expectedVersion: number; reasonCode: string; note: string },
) => {
  const advance = await loadActionable(publicId);
  const updated = await runTransactional(async () => {
    const u = await transitionAdvance({
      advanceId: advance.id, from: 'UNDER_REVIEW', to: 'REJECTED', actor: opsActor(ops),
      expectedVersion: input.expectedVersion, reason: `${input.reasonCode}: ${input.note}`,
      data: { decisionSource: 'MANUAL', rejectionCode: input.reasonCode, closedAt: new Date() },
      event: { type: DomainEvents.APPLICATION_REJECTED, payload: { reasons: [input.reasonCode] } },
    });
    await repo.closeReviewTask(advance.id, { decision: 'REJECT', assignee: ops.opsUserId, note: input.note, status: 'DONE' });
    return u;
  });
  return toAdvanceDto(updated);
};

/** SUPERVISOR: retry a confirmed-failed payout (re-verified with the bank first). */
export const retryDisbursement = async (ops: OpsPrincipal, publicId: string, note: string) => {
  const advance = await getAdvanceByPublicId(publicId);
  if (!advance) throw new AppError(ErrorCodes.NOT_FOUND, HttpStatus.NOT_FOUND);
  if (advance.status !== 'DISBURSEMENT_FAILED') throw new AppError(ErrorCodes.INVALID_STATE_TRANSITION, HttpStatus.CONFLICT);
  await retryFailedPayout(advance.id, opsActor(ops), note);
  return { id: publicId, retried: true };
};

/** Job (every 15 min): UNDER_REVIEW past the SLA → EXPIRED (user notified). */
export const expireReviewSla = async (now: Date = new Date()): Promise<number> => {
  const breached = await repo.findSlaBreached(now, 200);
  for (const task of breached) {
    try {
      await runTransactional(async () => {
        await transitionAdvance({
          advanceId: task.advanceId, from: 'UNDER_REVIEW', to: 'EXPIRED', actor: { type: 'SYSTEM', id: 'review-sla' },
          reason: 'REVIEW_SLA_BREACHED', event: { type: DomainEvents.APPLICATION_EXPIRED },
        });
        await repo.closeReviewTask(task.advanceId, { decision: 'EXPIRED', assignee: 'system', note: null, status: 'EXPIRED' });
      });
    } catch (err) {
      logger.warn({ err, advanceId: task.advanceId.toString() }, 'SLA expiry skipped (already actioned)');
    }
  }
  return breached.length;
};

export const searchApplications = async (f: {
  status?: AdvanceStatus | undefined;
  userId?: string | undefined;
  publicId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  cursor?: string | undefined;
  limit: number;
}) => {
  const rows = await repo.searchAdvances({
    status: f.status,
    userId: f.userId ? BigInt(f.userId) : undefined,
    publicId: f.publicId,
    from: f.from ? new Date(f.from) : undefined,
    to: f.to ? new Date(f.to) : undefined,
    cursor: f.cursor ? BigInt(f.cursor) : undefined,
    limit: f.limit,
  });
  const last = rows.at(-1);
  return {
    items: rows.map((r) => ({ ...toAdvanceDto(r), internalStatus: r.status, userId: r.userId.toString() })),
    nextCursor: rows.length === f.limit && last ? last.id.toString() : null,
  };
};

/** Details for ops. PII (account no., mobile) is masked; unmasking would itself be audited. */
export const getApplicationDetails = async (publicId: string) => {
  const d = await repo.getDetails(publicId);
  if (!d) throw new AppError(ErrorCodes.NOT_FOUND, HttpStatus.NOT_FOUND);
  return {
    ...toAdvanceDto(d),
    internalStatus: d.status,
    userId: d.userId.toString(),
    decision: { source: d.decisionSource, breEvaluationRef: d.breEvaluationRef, ruleSetVersion: d.ruleSetVersion, rejectionCode: d.rejectionCode },
    reviewTask: d.reviewTask && { status: d.reviewTask.status, slaDueAt: d.reviewTask.slaDueAt.toISOString(), decision: d.reviewTask.decision },
    disbursement: d.disbursement && {
      clientRef: d.disbursement.clientRef,
      status: d.disbursement.status,
      utr: d.disbursement.utr,
      retryCount: d.disbursement.retryCount,
      lastError: d.disbursement.lastError,
    },
    collections: d.collectionAttempts.map((a) => ({
      seq: a.attemptSeq,
      scheduledFor: a.scheduledFor.toISOString(),
      status: a.status,
      requested: paiseToNumber(a.requestedPaise),
      collected: paiseToNumber(a.collectedPaise),
      clientRef: a.clientRef,
    })),
    ledger: d.ledgerEntries.map((e) => ({ type: e.entryType, account: e.account, direction: e.direction, amount: paiseToNumber(e.amountPaise), reference: e.reference })),
    timeline: d.statusHistory.map((h) => ({ from: h.fromStatus, to: h.toStatus, actor: `${h.actorType}:${h.actorId}`, reason: h.reason, at: h.createdAt.toISOString() })),
  };
};

export const getAuditHistory = async (publicId: string) => {
  const advance = await getAdvanceByPublicId(publicId);
  if (!advance) throw new AppError(ErrorCodes.NOT_FOUND, HttpStatus.NOT_FOUND);
  const trail = await getAuditTrail('cash_advance', advance.id.toString());
  return {
    chainIntact: trail.chainIntact,
    firstBrokenIndex: trail.firstBrokenIndex,
    records: trail.records.map((r) => ({
      action: r.action,
      actor: `${r.actorType}:${r.actorId}`,
      before: r.before,
      after: r.after,
      reason: r.reason,
      at: r.createdAt.toISOString(),
      hash: r.hash,
    })),
  };
};

export const listRepayments = async (f: { dueDate?: string | undefined; status?: string | undefined; limit: number }) => {
  const rows = await repo.listRepayments({
    dueDate: f.dueDate ? toDateOnly(f.dueDate) : undefined,
    status: f.status as Parameters<typeof repo.listRepayments>[0]['status'],
    limit: f.limit,
  });
  return rows.map((a) => ({
    advanceId: a.advance.publicId,
    advanceStatus: a.advance.status,
    dueDate: a.advance.dueDate ? fromDateOnly(a.advance.dueDate) : null,
    outstanding: paiseToNumber(a.advance.totalRepayablePaise - a.advance.collectedPaise),
    attemptSeq: a.attemptSeq,
    attemptStatus: a.status,
    scheduledFor: a.scheduledFor.toISOString(),
    collected: paiseToNumber(a.collectedPaise),
  }));
};

/** ADMIN: flip a kill switch (audited). */
export const setKillSwitch = async (ops: OpsPrincipal, sw: KillSwitch, paused: boolean, reason: string) => {
  await setPaused(sw, paused);
  await recordAudit({ entityType: 'kill_switch', entityId: sw, action: paused ? 'PAUSED' : 'RESUMED', actor: opsActor(ops), reason });
  return { switch: sw, paused };
};

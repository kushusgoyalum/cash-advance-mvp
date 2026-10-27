import {
  AppError,
  BUSINESS,
  DomainEvents,
  ErrorCodes,
  hoursFromNow,
  HttpStatus,
  isPaused,
  KillSwitch,
  logger,
  newUlid,
  ProviderError,
} from '@common/index.js';
import { isUniqueConstraintError, runTransactional } from '@database/index.js';
import { recordAudit, type Actor } from '@modules/audit/index.js';
import {
  evaluateForDecision,
  getActiveProductConfig,
  getValidSnapshot,
  invalidateEligibilityCache,
  recheckHardGates,
} from '@modules/eligibility/index.js';
import { type AdvanceDto, toAdvanceDto } from './application.mappers.js';
import * as repo from './application.repo.js';
import type { AdvanceStatus, CashAdvance, Consents } from './application.types.js';
import { isValidStepUpToken, kfsUrlFor } from './application.utils.js';
import { computeQuote } from './pricing.js';
import { transitionAdvance, USER_CANCELLABLE } from './stateMachine.js';

const SYSTEM: Actor = { type: 'SYSTEM', id: 'cash-advance-service' };
const userActor = (userId: bigint): Actor => ({ type: 'USER', id: userId.toString() });

const getOwnedOrThrow = async (userId: bigint, publicId: string): Promise<CashAdvance> => {
  const advance = await repo.findForUser(userId, publicId);
  if (!advance) throw new AppError(ErrorCodes.NOT_FOUND, HttpStatus.NOT_FOUND);
  return advance;
};

/**
 * POST /applications → DRAFT with a LOCKED quote + KFS. A stale DRAFT of the same user is
 * superseded; any other active advance → 409 (also enforced by the DB unique key).
 */
export const createDraft = async (
  userId: bigint,
  input: { amountPaise: bigint; tenureDays: number; snapshotId: bigint },
): Promise<AdvanceDto & { kfsUrl: string; draftExpiresAt: string }> => {
  if (await isPaused(KillSwitch.NEW_APPLICATIONS)) throw new AppError(ErrorCodes.FEATURE_DISABLED, HttpStatus.SERVICE_UNAVAILABLE);

  const snapshot = await getValidSnapshot(userId, input.snapshotId);
  if (input.amountPaise > snapshot.maxAmountPaise) {
    throw new AppError(ErrorCodes.AMOUNT_EXCEEDS_LIMIT, HttpStatus.UNPROCESSABLE_ENTITY, { max: Number(snapshot.maxAmountPaise) });
  }
  const config = await getActiveProductConfig();
  const quote = computeQuote({ amountPaise: input.amountPaise, tenureDays: input.tenureDays, tier: snapshot.tier ?? 'STARTER', config });

  try {
    const created = await runTransactional(async () => {
      const existing = await repo.findActiveForUser(userId);
      if (existing?.status === 'DRAFT') {
        await transitionAdvance({ advanceId: existing.id, from: 'DRAFT', to: 'CANCELLED', actor: SYSTEM, reason: 'SUPERSEDED_BY_NEW_DRAFT' });
      } else if (existing) {
        throw new AppError(ErrorCodes.ACTIVE_ADVANCE_EXISTS, HttpStatus.CONFLICT);
      }
      const advance = await repo.createAdvance({
        publicId: newUlid(),
        userId,
        status: 'DRAFT',
        principalPaise: quote.principalPaise,
        feePaise: quote.feePaise,
        totalRepayablePaise: quote.totalRepayablePaise,
        tenureDays: input.tenureDays,
        dueDate: new Date(`${quote.indicativeDueDate}T00:00:00Z`),
        aprBps: quote.aprBps,
        tier: snapshot.tier ?? 'STARTER',
        snapshotId: snapshot.id,
        productConfigVersion: config.version,
        lenderCode: config.lenderCode,
        draftExpiresAt: hoursFromNow(BUSINESS.DRAFT_TTL_HOURS),
      });
      await repo.insertHistory({ advanceId: advance.id, fromStatus: null, toStatus: 'DRAFT', actorType: 'USER', actorId: userId.toString() });
      await recordAudit({ entityType: 'cash_advance', entityId: advance.id.toString(), action: 'CREATED', actor: userActor(userId), after: { status: 'DRAFT' } });
      return advance;
    });
    return { ...toAdvanceDto(created), kfsUrl: kfsUrlFor(created.publicId), draftExpiresAt: created.draftExpiresAt.toISOString() };
  } catch (err) {
    // Final guard: the generated-column UNIQUE key (one active advance per user).
    if (isUniqueConstraintError(err)) throw new AppError(ErrorCodes.ACTIVE_ADVANCE_EXISTS, HttpStatus.CONFLICT);
    throw err;
  }
};

/** POST /applications/{id}/submit — consents + step-up, hard gates re-checked, DRAFT → SUBMITTED. */
export const submitApplication = async (
  userId: bigint,
  publicId: string,
  input: { consents: Consents; stepUpToken?: string | undefined; ip?: string | undefined; requestId?: string | undefined },
): Promise<AdvanceDto> => {
  const advance = await getOwnedOrThrow(userId, publicId);
  if (advance.status !== 'DRAFT') {
    throw new AppError(ErrorCodes.INVALID_STATE_TRANSITION, HttpStatus.CONFLICT, { current: advance.status });
  }
  if (advance.draftExpiresAt < new Date()) {
    await transitionAdvance({ advanceId: advance.id, from: 'DRAFT', to: 'EXPIRED', actor: SYSTEM, reason: 'QUOTE_EXPIRED' });
    throw new AppError(ErrorCodes.QUOTE_EXPIRED, HttpStatus.CONFLICT);
  }
  const { kfsAccepted, bureauPullConsent, debitAuthorization } = input.consents;
  if (!kfsAccepted || !bureauPullConsent || !debitAuthorization) throw new AppError(ErrorCodes.CONSENT_MISSING, HttpStatus.UNPROCESSABLE_ENTITY);
  if (!isValidStepUpToken(input.stepUpToken, userId)) throw new AppError(ErrorCodes.AUTH_INVALID_TOKEN, HttpStatus.UNAUTHORIZED, { stepUp: true });

  const gates = await recheckHardGates(userId, advance.id);
  if (!gates.eligible) throw new AppError(ErrorCodes.NOT_ELIGIBLE, HttpStatus.UNPROCESSABLE_ENTITY, { reasons: gates.reasons });

  const consentRef = `CNS-${advance.publicId}`;
  const updated = await transitionAdvance({
    advanceId: advance.id,
    from: 'DRAFT',
    to: 'SUBMITTED',
    actor: userActor(userId),
    requestId: input.requestId,
    data: { consents: { ...input.consents, consentRef, acceptedAt: new Date().toISOString(), ip: input.ip ?? null } },
    event: { type: DomainEvents.APPLICATION_SUBMITTED },
  });
  await invalidateEligibilityCache(userId);
  return toAdvanceDto(updated);
};

/** Cancel is allowed until the payout starts; the conditional update wins any race with the payout worker. */
export const cancelApplication = async (userId: bigint, publicId: string): Promise<AdvanceDto> => {
  const advance = await getOwnedOrThrow(userId, publicId);
  if (!USER_CANCELLABLE.includes(advance.status)) {
    throw new AppError(ErrorCodes.INVALID_STATE_TRANSITION, HttpStatus.CONFLICT, { current: advance.status });
  }
  const updated = await transitionAdvance({
    advanceId: advance.id,
    from: advance.status,
    to: 'CANCELLED',
    actor: userActor(userId),
    reason: 'USER_CANCELLED',
    event: { type: DomainEvents.APPLICATION_CANCELLED },
  });
  await invalidateEligibilityCache(userId);
  return toAdvanceDto(updated);
};

export const getApplicationForUser = async (userId: bigint, publicId: string): Promise<AdvanceDto> =>
  toAdvanceDto(await getOwnedOrThrow(userId, publicId));

export const listApplicationsForUser = async (
  userId: bigint,
  opts: { status?: AdvanceStatus | undefined; cursor?: string | undefined; limit: number },
) => {
  const rows = await repo.listForUser(userId, { status: opts.status, cursor: opts.cursor ? BigInt(opts.cursor) : undefined, limit: opts.limit });
  const last = rows.at(-1);
  return { items: rows.map(toAdvanceDto), nextCursor: rows.length === opts.limit && last ? last.id.toString() : null };
};

/**
 * Decision worker (consumes APPLICATION_SUBMITTED). Idempotent: anything not SUBMITTED is
 * ignored. If the bureau is down, the message is retried (SQS backoff); after 2h the
 * application is REFERRED to manual review instead of blocking the user.
 */
export const decideApplication = async (advanceId: bigint): Promise<void> => {
  const advance = await repo.findById(advanceId);
  if (!advance || advance.status !== 'SUBMITTED') return;
  const consentRef = (advance.consents as { consentRef?: string } | null)?.consentRef ?? `CNS-${advance.publicId}`;

  let result;
  try {
    result = await evaluateForDecision({ userId: advance.userId, advanceId, amountPaise: advance.principalPaise, consentRef });
  } catch (err) {
    const ageMs = Date.now() - advance.updatedAt.getTime();
    if (err instanceof ProviderError && ageMs > BUSINESS.BUREAU_REFER_AFTER_HOURS * 3_600_000) {
      logger.warn({ advanceId: advanceId.toString() }, 'bureau unavailable for 2h → refer');
      await transitionAdvance({
        advanceId, from: 'SUBMITTED', to: 'UNDER_REVIEW', actor: SYSTEM, reason: 'BUREAU_UNAVAILABLE',
        event: { type: DomainEvents.APPLICATION_REFERRED },
      });
      return;
    }
    throw err; // redelivered by SQS with backoff
  }

  const decisionData = { decisionSource: 'AUTO' as const, breEvaluationRef: result.breEvaluationRef, ruleSetVersion: result.ruleSetVersion };
  if (result.decision === 'APPROVE') {
    await transitionAdvance({ advanceId, from: 'SUBMITTED', to: 'APPROVED', actor: SYSTEM, data: decisionData, event: { type: DomainEvents.APPLICATION_APPROVED } });
  } else if (result.decision === 'REFER') {
    await transitionAdvance({
      advanceId, from: 'SUBMITTED', to: 'UNDER_REVIEW', actor: SYSTEM, reason: result.reasons.join(','), data: decisionData,
      event: { type: DomainEvents.APPLICATION_REFERRED, payload: { reasons: result.reasons } },
    });
  } else {
    await transitionAdvance({
      advanceId, from: 'SUBMITTED', to: 'REJECTED', actor: SYSTEM, reason: result.reasons.join(','),
      data: { ...decisionData, rejectionCode: result.reasons[0] ?? 'RULES_REJECTED', closedAt: new Date() },
      event: { type: DomainEvents.APPLICATION_REJECTED, payload: { reasons: result.reasons } },
    });
  }
  await invalidateEligibilityCache(advance.userId);
};

/** Job: DRAFTs past their 24h quote validity → EXPIRED. */
export const expireStaleDrafts = async (now: Date = new Date()): Promise<number> => {
  const drafts = await repo.findExpiredDrafts(now, 500);
  let expired = 0;
  for (const d of drafts) {
    try {
      await transitionAdvance({ advanceId: d.id, from: 'DRAFT', to: 'EXPIRED', actor: SYSTEM, reason: 'DRAFT_TTL' });
      expired += 1;
    } catch (err) {
      if (!(err instanceof AppError)) throw err; // lost a race with submit/cancel — fine
    }
  }
  return expired;
};

export const getAdvanceById = (advanceId: bigint) => repo.findByIdOrThrow(advanceId);
export const getAdvanceByPublicId = (publicId: string) => repo.findByPublicId(publicId);
export const getStatusHistory = (advanceId: bigint) => repo.listHistory(advanceId);
export const lockAdvanceForUpdate = (advanceId: bigint) => repo.lockForUpdate(advanceId);

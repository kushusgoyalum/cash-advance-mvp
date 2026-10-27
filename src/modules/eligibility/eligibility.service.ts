import {
  AppError,
  BUSINESS,
  canonicalJson,
  ErrorCodes,
  HttpStatus,
  logger,
  ProviderError,
  secondsFromNow,
  withRetry,
} from '@common/index.js';
import { getRedisClient } from '@database/index.js';
import { type BureauSummary, getBureauProvider, getPlatformClient } from '@modules/thirdParty/index.js';
import { evaluateRuleSet } from './bre/ruleEngine.js';
import { DECISION_RULESET_V1, SOFT_RULESET_V1 } from './bre/ruleSets.js';
import * as repo from './eligibility.repo.js';
import type { DecisionResult, EligibilityView } from './eligibility.types.js';
import { buildSoftFacts, capTierByHistory, computeMaxAmountPaise, eligibleFromDate } from './eligibility.utils.js';
import { getActiveProductConfig } from './product/productConfig.service.js';

const cacheKey = (userId: bigint): string => `elg:${userId}`;

const fetchProfile = async (userId: bigint) => {
  try {
    return await getPlatformClient().getUserProfile(userId.toString());
  } catch (err) {
    logger.warn({ err }, 'platform profile unavailable');
    throw new AppError(ErrorCodes.TEMPORARILY_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE);
  }
};

const readCache = async (userId: bigint): Promise<EligibilityView | null> => {
  try {
    const raw = await getRedisClient().get(cacheKey(userId));
    if (!raw) return null;
    const v = JSON.parse(raw) as Record<string, unknown> & { feeSchedule: Array<Record<string, string>> };
    const view: EligibilityView = {
      ...(v as unknown as EligibilityView),
      snapshotId: BigInt(v.snapshotId as string),
      maxAmountPaise: BigInt(v.maxAmountPaise as string),
      validTill: new Date(v.validTill as string),
      feeSchedule: v.feeSchedule.map((f) => ({ tier: f.tier ?? '', upToPaise: BigInt(f.upToPaise ?? '0'), feePaise: BigInt(f.feePaise ?? '0') })),
    };
    return view.validTill > new Date() ? view : null;
  } catch {
    return null; // cache is an optimisation only
  }
};

/**
 * "Check eligibility" (soft — NO bureau pull). Result is persisted as a snapshot (referenced
 * by the draft) and cached for 15 minutes so app opens don't hammer platform services.
 */
export const getEligibility = async (userId: bigint): Promise<EligibilityView> => {
  const cached = await readCache(userId);
  if (cached) return cached;

  const now = new Date();
  const [profile, flags, config] = await Promise.all([fetchProfile(userId), repo.getAdvanceFlags(userId), getActiveProductConfig()]);
  const result = evaluateRuleSet(SOFT_RULESET_V1, buildSoftFacts(profile, flags, now));
  const eligible = result.outcome === 'PASS';
  const tier = eligible ? capTierByHistory(result.tier, flags.priorRepaidCount) : null;
  const maxAmountPaise = eligible ? computeMaxAmountPaise(config, tier, profile.avgMonthlyInflowPaise) : 0n;
  const finalEligible = eligible && maxAmountPaise > 0n;
  const reasons = finalEligible || !eligible ? result.reasons : ['LIMIT_BELOW_MINIMUM'];
  const eligibleFrom = reasons.includes('ACCOUNT_AGE_LT_30D') ? eligibleFromDate(profile.accountCreatedAt) : null;
  const validTill = secondsFromNow(BUSINESS.ELIGIBILITY_SNAPSHOT_TTL_SECONDS, now);

  const snapshot = await repo.createSnapshot({
    userId,
    eligible: finalEligible,
    reasons,
    tier,
    maxAmountPaise,
    eligibleFrom: eligibleFrom ? new Date(`${eligibleFrom}T00:00:00Z`) : null,
    ruleSetVersion: SOFT_RULESET_V1.version,
    validTill,
  });

  const view: EligibilityView = {
    snapshotId: snapshot.id,
    eligible: finalEligible,
    reasons,
    tier,
    maxAmountPaise,
    eligibleFrom,
    validTill,
    tenureOptionsDays: config.tenureOptionsDays,
    feeSchedule: config.tiers.map((t) => ({ tier: t.tier, upToPaise: t.capPaise, feePaise: t.feePaise })),
    productConfigVersion: config.version,
  };
  await getRedisClient()
    .set(cacheKey(userId), canonicalJson(view), 'EX', BUSINESS.ELIGIBILITY_SNAPSHOT_TTL_SECONDS)
    .catch(() => undefined);
  return view;
};

/** Used by the application module when creating a draft. */
export const getValidSnapshot = async (userId: bigint, snapshotId: bigint) => {
  const snap = await repo.findSnapshot(snapshotId);
  if (!snap || snap.userId !== userId || snap.validTill < new Date()) {
    throw new AppError(ErrorCodes.SNAPSHOT_EXPIRED, HttpStatus.CONFLICT);
  }
  if (!snap.eligible) throw new AppError(ErrorCodes.NOT_ELIGIBLE, HttpStatus.UNPROCESSABLE_ENTITY, { reasons: snap.reasons });
  return snap;
};

/** Fresh hard-gate check at submit (profile may have changed since the snapshot). */
export const recheckHardGates = async (userId: bigint, excludeAdvanceId: bigint): Promise<{ eligible: boolean; reasons: string[] }> => {
  const [profile, flags] = await Promise.all([fetchProfile(userId), repo.getAdvanceFlags(userId, excludeAdvanceId)]);
  const r = evaluateRuleSet(SOFT_RULESET_V1, buildSoftFacts(profile, flags, new Date()));
  return { eligible: r.outcome === 'PASS', reasons: r.reasons };
};

/** Bureau report reused for up to 30 days; otherwise a consented hard pull (retried 1s/4s/10s). */
const getBureauSummary = async (userId: string, consentRef: string): Promise<BureauSummary> => {
  const since = new Date(Date.now() - BUSINESS.BUREAU_REPORT_REUSE_DAYS * 86_400_000);
  const recent = await repo.findRecentBureauReport(userId, since);
  if (recent) return recent.summary as unknown as BureauSummary;
  const { summary, raw } = await withRetry(() => getBureauProvider().pullReport({ userId, consentRef }), [1_000, 4_000, 10_000]);
  await repo.saveBureauReport({ userId, bureau: summary.bureau, consentRef, summary: { ...summary }, raw: (raw ?? {}) as object });
  return summary;
};

/**
 * Decision-time evaluation (called by the decision worker). Throws ProviderError when the
 * bureau is unavailable — the caller keeps the application SUBMITTED and retries / refers.
 */
export const evaluateForDecision = async (input: {
  userId: bigint;
  advanceId: bigint;
  amountPaise: bigint;
  consentRef: string;
}): Promise<DecisionResult> => {
  const now = new Date();
  const [profile, flags, config] = await Promise.all([
    fetchProfile(input.userId),
    repo.getAdvanceFlags(input.userId, input.advanceId),
    getActiveProductConfig(),
  ]);
  const bureau = await getBureauSummary(input.userId.toString(), input.consentRef);
  const soft = buildSoftFacts(profile, flags, now);
  const softTier = evaluateRuleSet(SOFT_RULESET_V1, soft).tier;
  const tier = capTierByHistory(softTier, flags.priorRepaidCount);
  const maxAmount = computeMaxAmountPaise(config, tier, profile.avgMonthlyInflowPaise);

  const facts = {
    ...soft,
    amountWithinLimit: input.amountPaise <= maxAmount,
    bureauScore: bureau.score,
    dpd90PlusLast12m: bureau.dpd90PlusLast12m,
    writtenOffAccounts: bureau.writtenOffAccounts,
    enquiriesLast30d: bureau.enquiriesLast30d,
  };
  const result = evaluateRuleSet(DECISION_RULESET_V1, facts);
  const decision = result.outcome === 'PASS' ? 'APPROVE' : result.outcome;

  const breEvaluationRef = await repo.saveBreEvaluation({
    userId: input.userId.toString(),
    advanceId: input.advanceId.toString(),
    stage: DECISION_RULESET_V1.stage,
    ruleSetVersion: DECISION_RULESET_V1.version,
    facts,
    ruleResults: result.ruleResults,
    decision,
    tier,
  });
  return { decision, reasons: result.reasons, tier, ruleSetVersion: DECISION_RULESET_V1.version, breEvaluationRef };
};

export const invalidateEligibilityCache = async (userId: bigint): Promise<void> => {
  await getRedisClient().del(cacheKey(userId)).catch(() => undefined);
};

export { ProviderError };

import { addDays, BUSINESS, istBusinessDate, minPaise } from '@common/index.js';
import type { UserProfile } from '@modules/thirdParty/index.js';
import type { Facts } from './bre/ruleEngine.js';
import type { AdvanceFlags } from './eligibility.types.js';
import type { ProductConfigView } from './product/productConfig.service.js';

const DAY_MS = 86_400_000;
/** Max advance = 30% of average monthly inflow (then capped by tier and product max). */
const INFLOW_MULTIPLIER_BPS = 3_000n;
const TIER_ORDER = ['STARTER', 'T1', 'T2', 'T3'];

export const accountAgeDays = (createdAt: Date, now: Date): number => Math.floor((now.getTime() - createdAt.getTime()) / DAY_MS);

export const buildSoftFacts = (profile: UserProfile, flags: AdvanceFlags, now: Date): Facts => ({
  accountActive: profile.accountStatus === 'ACTIVE',
  kycCompleted: profile.kycStatus === 'COMPLETED',
  accountAgeDays: accountAgeDays(profile.accountCreatedAt, now),
  // "≥ N transactions OR at least one income credit" (assumption A6)
  hasMinimumActivity: profile.txnCountLast90d >= BUSINESS.MIN_TXN_COUNT_90D || profile.incomeCreditsLast90d >= 1,
  hasOverdueAdvance: flags.hasOverdueAdvance,
  hasActiveAdvance: flags.hasActiveAdvance,
  inRejectionCooldown:
    flags.lastRejectedAt !== null && now.getTime() - flags.lastRejectedAt.getTime() < BUSINESS.REJECTION_COOLDOWN_DAYS * DAY_MS,
  fraudFlag: profile.fraudFlag,
  avgMonthlyInflowRupees: Number(profile.avgMonthlyInflowPaise / 100n),
});

/** New users: eligible from account creation + 30 days (IST date) — shown as a countdown. */
export const eligibleFromDate = (createdAt: Date): string => addDays(istBusinessDate(createdAt), BUSINESS.MIN_ACCOUNT_AGE_DAYS);

/** Tier graduation: first-timers stay on STARTER; on-time repayments unlock higher tiers. */
export const capTierByHistory = (tier: string | null, priorRepaidCount: number): string | null => {
  if (!tier) return null;
  const maxIdx = priorRepaidCount === 0 ? 0 : priorRepaidCount < 3 ? 1 : TIER_ORDER.length - 1;
  return TIER_ORDER[Math.min(TIER_ORDER.indexOf(tier), maxIdx)] ?? 'STARTER';
};

export const computeMaxAmountPaise = (config: ProductConfigView, tier: string | null, avgMonthlyInflowPaise: bigint): bigint => {
  const cap = config.tiers.find((t) => t.tier === tier)?.capPaise ?? 0n;
  const byInflow = (avgMonthlyInflowPaise * INFLOW_MULTIPLIER_BPS) / 10_000n;
  const raw = minPaise(minPaise(cap, byInflow), config.maxAmountPaise);
  const rounded = (raw / 100_00n) * 100_00n; // round down to ₹100
  return rounded < config.minAmountPaise ? 0n : rounded;
};

import type { Rule, RuleSet } from './ruleEngine.js';

/**
 * Rule sets v1. MVP: versioned config in code; later loaded from a config store and edited
 * through an admin UI (deferred). `rule_set_version` is stored on every decision.
 */
const HARD_GATES: readonly Rule[] = [
  { type: 'GATE', id: 'account_active', fact: 'accountActive', op: 'eq', value: true, onFail: 'REJECT', reason: 'ACCOUNT_NOT_ACTIVE' },
  { type: 'GATE', id: 'kyc_completed', fact: 'kycCompleted', op: 'eq', value: true, onFail: 'REJECT', reason: 'KYC_NOT_COMPLETED' },
  { type: 'GATE', id: 'account_age', fact: 'accountAgeDays', op: 'gte', value: 30, onFail: 'REJECT', reason: 'ACCOUNT_AGE_LT_30D' },
  { type: 'GATE', id: 'min_activity', fact: 'hasMinimumActivity', op: 'eq', value: true, onFail: 'REJECT', reason: 'LOW_ACCOUNT_ACTIVITY' },
  { type: 'GATE', id: 'no_overdue', fact: 'hasOverdueAdvance', op: 'eq', value: false, onFail: 'REJECT', reason: 'OVERDUE_ADVANCE' },
  { type: 'GATE', id: 'no_active', fact: 'hasActiveAdvance', op: 'eq', value: false, onFail: 'REJECT', reason: 'ACTIVE_ADVANCE_EXISTS' },
  { type: 'GATE', id: 'cooldown', fact: 'inRejectionCooldown', op: 'eq', value: false, onFail: 'REJECT', reason: 'REJECTION_COOLDOWN' },
  { type: 'GATE', id: 'fraud', fact: 'fraudFlag', op: 'eq', value: false, onFail: 'REJECT', reason: 'RISK_FLAG' },
  {
    type: 'TIER_TABLE',
    id: 'inflow_tier',
    fact: 'avgMonthlyInflowRupees',
    bands: [
      { minInclusive: 50_000, tier: 'T3' },
      { minInclusive: 25_000, tier: 'T2' },
      { minInclusive: 10_000, tier: 'T1' },
      { minInclusive: 0, tier: 'STARTER' },
    ],
  },
];

/** Shown on "check eligibility" — no bureau pull (soft). */
export const SOFT_RULESET_V1: RuleSet = { version: 'soft-v1', stage: 'SOFT', rules: HARD_GATES };

/** Run at decision time after consent — adds bureau hard-pull rules and the REFER band. */
export const DECISION_RULESET_V1: RuleSet = {
  version: 'decision-v1',
  stage: 'DECISION',
  rules: [
    ...HARD_GATES,
    { type: 'GATE', id: 'amount_limit', fact: 'amountWithinLimit', op: 'eq', value: true, onFail: 'REJECT', reason: 'AMOUNT_ABOVE_LIMIT' },
    { type: 'GATE', id: 'score_floor', fact: 'bureauScore', op: 'gte', value: 650, onFail: 'REJECT', onMissing: 'REFER', reason: 'BUREAU_SCORE_LOW' },
    { type: 'GATE', id: 'score_auto', fact: 'bureauScore', op: 'gte', value: 700, onFail: 'REFER', onMissing: 'REFER', reason: 'BUREAU_SCORE_BORDERLINE' },
    { type: 'GATE', id: 'dpd90', fact: 'dpd90PlusLast12m', op: 'lte', value: 0, onFail: 'REJECT', reason: 'RECENT_SEVERE_DELINQUENCY' },
    { type: 'GATE', id: 'write_off', fact: 'writtenOffAccounts', op: 'lte', value: 0, onFail: 'REJECT', reason: 'WRITE_OFF_HISTORY' },
    { type: 'GATE', id: 'enquiries', fact: 'enquiriesLast30d', op: 'lte', value: 6, onFail: 'REFER', reason: 'HIGH_CREDIT_HUNGER' },
  ],
};

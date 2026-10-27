import { describe, expect, it } from 'vitest';
import { evaluateRuleSet } from '../bre/ruleEngine.js';
import { DECISION_RULESET_V1, SOFT_RULESET_V1 } from '../bre/ruleSets.js';
import { capTierByHistory, computeMaxAmountPaise, eligibleFromDate } from '../eligibility.utils.js';
import { DEFAULT_PRODUCT_CONFIG } from '../product/productConfig.service.js';

const goodSoft = {
  accountActive: true,
  kycCompleted: true,
  accountAgeDays: 120,
  hasMinimumActivity: true,
  hasOverdueAdvance: false,
  hasActiveAdvance: false,
  inRejectionCooldown: false,
  fraudFlag: false,
  avgMonthlyInflowRupees: 30_000,
};
const goodBureau = { amountWithinLimit: true, bureauScore: 742, dpd90PlusLast12m: 0, writtenOffAccounts: 0, enquiriesLast30d: 1 };

describe('BRE — soft eligibility', () => {
  it('passes and assigns an inflow tier', () => {
    const r = evaluateRuleSet(SOFT_RULESET_V1, goodSoft);
    expect(r.outcome).toBe('PASS');
    expect(r.tier).toBe('T2');
  });

  it('new user (< 30 days) is ineligible with ACCOUNT_AGE_LT_30D', () => {
    const r = evaluateRuleSet(SOFT_RULESET_V1, { ...goodSoft, accountAgeDays: 12 });
    expect(r.outcome).toBe('REJECT');
    expect(r.reasons).toEqual(['ACCOUNT_AGE_LT_30D']);
  });

  it('collects every failing reason (KYC + overdue)', () => {
    const r = evaluateRuleSet(SOFT_RULESET_V1, { ...goodSoft, kycCompleted: false, hasOverdueAdvance: true });
    expect(r.reasons).toEqual(['KYC_NOT_COMPLETED', 'OVERDUE_ADVANCE']);
  });
});

describe('BRE — decision (bureau)', () => {
  it('APPROVE path', () => {
    expect(evaluateRuleSet(DECISION_RULESET_V1, { ...goodSoft, ...goodBureau }).outcome).toBe('PASS');
  });

  it('borderline score → REFER to manual review', () => {
    const r = evaluateRuleSet(DECISION_RULESET_V1, { ...goodSoft, ...goodBureau, bureauScore: 680 });
    expect(r.outcome).toBe('REFER');
    expect(r.reasons).toContain('BUREAU_SCORE_BORDERLINE');
  });

  it('thin file (no score) → REFER, not REJECT', () => {
    expect(evaluateRuleSet(DECISION_RULESET_V1, { ...goodSoft, ...goodBureau, bureauScore: null }).outcome).toBe('REFER');
  });

  it('REJECT beats REFER (low score + high enquiries)', () => {
    const r = evaluateRuleSet(DECISION_RULESET_V1, { ...goodSoft, ...goodBureau, bureauScore: 600, enquiriesLast30d: 9 });
    expect(r.outcome).toBe('REJECT');
  });
});

describe('limits and new-user helpers', () => {
  it('first-time borrowers are capped at STARTER; repayments unlock tiers', () => {
    expect(capTierByHistory('T3', 0)).toBe('STARTER');
    expect(capTierByHistory('T3', 1)).toBe('T1');
    expect(capTierByHistory('T2', 5)).toBe('T2');
  });

  it('max amount = min(tier cap, 30% of inflow, product max), rounded down to ₹100', () => {
    expect(computeMaxAmountPaise(DEFAULT_PRODUCT_CONFIG, 'T1', 12_345_00n)).toBe(3_700_00n);
    expect(computeMaxAmountPaise(DEFAULT_PRODUCT_CONFIG, 'STARTER', 1_00_000_00n)).toBe(2_000_00n);
    expect(computeMaxAmountPaise(DEFAULT_PRODUCT_CONFIG, 'STARTER', 1_000_00n)).toBe(0n); // below product minimum
  });

  it('eligibleFrom = account creation (IST) + 30 days', () => {
    expect(eligibleFromDate(new Date('2026-10-20T10:00:00Z'))).toBe('2026-11-19');
  });
});

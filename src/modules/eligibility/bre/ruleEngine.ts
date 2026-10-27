/**
 * Small, configurable rule engine. Rule sets are DATA (versioned), so eligibility criteria can
 * evolve without code changes. Outcome precedence: REJECT > REFER > PASS.
 */
export type Outcome = 'PASS' | 'REFER' | 'REJECT';
export type FactValue = number | string | boolean | null;
export type Facts = Record<string, FactValue>;

export interface GateRule {
  type: 'GATE';
  id: string;
  fact: string;
  op: 'eq' | 'neq' | 'gte' | 'lte' | 'in';
  value: FactValue | readonly FactValue[];
  onFail: Exclude<Outcome, 'PASS'>;
  /** Outcome when the fact is missing/null (e.g. thin-file bureau). Defaults to onFail. */
  onMissing?: Outcome;
  reason: string;
}

export interface TierRule {
  type: 'TIER_TABLE';
  id: string;
  fact: string;
  /** Evaluated top-down; first band with value >= minInclusive wins. */
  bands: ReadonlyArray<{ minInclusive: number; tier: string }>;
}

export type Rule = GateRule | TierRule;

export interface RuleSet {
  version: string;
  stage: 'SOFT' | 'DECISION';
  rules: readonly Rule[];
}

export interface RuleResult {
  id: string;
  outcome: Outcome;
  reason?: string;
  actual: FactValue | undefined;
}

export interface EvaluationResult {
  outcome: Outcome;
  reasons: string[];
  tier: string | null;
  ruleResults: RuleResult[];
}

const RANK: Record<Outcome, number> = { PASS: 0, REFER: 1, REJECT: 2 };

const compare = (actual: FactValue, op: GateRule['op'], expected: GateRule['value']): boolean => {
  switch (op) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'gte':
      return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
    case 'lte':
      return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
    case 'in':
      return Array.isArray(expected) && expected.includes(actual);
    default:
      return false;
  }
};

export const evaluateRuleSet = (ruleSet: RuleSet, facts: Facts): EvaluationResult => {
  const ruleResults: RuleResult[] = [];
  let outcome: Outcome = 'PASS';
  let tier: string | null = null;

  for (const rule of ruleSet.rules) {
    const actual = facts[rule.fact];
    if (rule.type === 'TIER_TABLE') {
      const band = typeof actual === 'number' ? rule.bands.find((b) => actual >= b.minInclusive) : undefined;
      tier = band?.tier ?? null;
      ruleResults.push({ id: rule.id, outcome: 'PASS', actual, ...(tier ? { reason: `TIER_${tier}` } : {}) });
      continue;
    }
    const missing = actual === undefined || actual === null;
    const ruleOutcome: Outcome = missing ? (rule.onMissing ?? rule.onFail) : compare(actual, rule.op, rule.value) ? 'PASS' : rule.onFail;
    ruleResults.push({ id: rule.id, outcome: ruleOutcome, actual, ...(ruleOutcome !== 'PASS' ? { reason: rule.reason } : {}) });
    if (RANK[ruleOutcome] > RANK[outcome]) outcome = ruleOutcome;
  }

  const reasons = ruleResults.filter((r) => r.outcome !== 'PASS' && r.reason).map((r) => r.reason as string);
  return { outcome, reasons, tier, ruleResults };
};

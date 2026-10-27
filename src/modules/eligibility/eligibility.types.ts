export interface AdvanceFlags {
  hasActiveAdvance: boolean;
  hasOverdueAdvance: boolean;
  lastRejectedAt: Date | null;
  priorRepaidCount: number;
}

export interface EligibilityView {
  snapshotId: bigint;
  eligible: boolean;
  reasons: string[];
  tier: string | null;
  maxAmountPaise: bigint;
  /** Set for new users (< 30 days): the IST date from which they become eligible. */
  eligibleFrom: string | null;
  validTill: Date;
  tenureOptionsDays: number[];
  feeSchedule: Array<{ tier: string; upToPaise: bigint; feePaise: bigint }>;
  productConfigVersion: number;
}

export type Decision = 'APPROVE' | 'REFER' | 'REJECT';

export interface DecisionResult {
  decision: Decision;
  reasons: string[];
  tier: string | null;
  ruleSetVersion: string;
  breEvaluationRef: string;
}

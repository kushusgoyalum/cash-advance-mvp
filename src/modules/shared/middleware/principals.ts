export interface UserPrincipal {
  userId: bigint;
  sessionId: string | undefined;
}

/** Ops roles are ordered — a higher role includes everything below it. */
export const OPS_ROLES = ['VIEWER', 'REVIEWER', 'SUPERVISOR', 'ADMIN'] as const;
export type OpsRole = (typeof OPS_ROLES)[number];

export interface OpsPrincipal {
  opsUserId: string;
  role: OpsRole;
  /** Max amount (paise) this reviewer may approve. */
  approvalLimitPaise: bigint;
}

export const roleAtLeast = (actual: OpsRole, required: OpsRole): boolean =>
  OPS_ROLES.indexOf(actual) >= OPS_ROLES.indexOf(required);

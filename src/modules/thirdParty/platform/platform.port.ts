/** Existing platform services (user/account/KYC) — this service never owns KYC. */
export interface UserProfile {
  userId: string;
  accountStatus: 'ACTIVE' | 'FROZEN' | 'CLOSED';
  kycStatus: 'COMPLETED' | 'PENDING' | 'REJECTED';
  accountCreatedAt: Date;
  txnCountLast90d: number;
  incomeCreditsLast90d: number;
  avgMonthlyInflowPaise: bigint;
  /** Opaque reference to the user's account at the banking provider. */
  accountRef: string;
  fraudFlag: boolean;
}

export interface UserContact {
  mobile: string;
  email: string | null;
}

export interface PlatformClient {
  getUserProfile(userId: string): Promise<UserProfile>;
  getUserContact(userId: string): Promise<UserContact>;
  /** Users whose account received a credit (used for early collection retry). */
}

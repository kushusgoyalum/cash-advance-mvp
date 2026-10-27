import type { PlatformClient } from '../platform.port.js';

export const mockPlatformClient: PlatformClient = {
  async getUserProfile(userId) {
    return {
      userId,
      accountStatus: 'ACTIVE',
      kycStatus: 'COMPLETED',
      accountCreatedAt: new Date(Date.now() - 120 * 24 * 3_600_000),
      txnCountLast90d: 40,
      incomeCreditsLast90d: 3,
      avgMonthlyInflowPaise: 35_000_00n,
      accountRef: `ACC-${userId}`,
      fraudFlag: false,
    };
  },
  async getUserContact() {
    return { mobile: '9999999999', email: 'user@example.com' };
  },
};

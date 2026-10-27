import { env } from '@common/index.js';
import { httpJson } from '../../http.js';
import type { PlatformClient, UserContact, UserProfile } from '../platform.port.js';

type RawProfile = Omit<UserProfile, 'accountCreatedAt' | 'avgMonthlyInflowPaise'> & {
  accountCreatedAt: string;
  avgMonthlyInflowPaise: string;
};

export const httpPlatformClient: PlatformClient = {
  async getUserProfile(userId) {
    const r = await httpJson<RawProfile>({
      provider: 'platform',
      operation: 'userProfile',
      baseUrl: env.PLATFORM_BASE_URL,
      method: 'GET',
      path: `/internal/users/${userId}/profile`,
      headers: { 'x-internal-token': env.INTERNAL_API_TOKEN },
      timeoutMs: 3_000,
    });
    return { ...r, accountCreatedAt: new Date(r.accountCreatedAt), avgMonthlyInflowPaise: BigInt(r.avgMonthlyInflowPaise) };
  },
  async getUserContact(userId) {
    return httpJson<UserContact>({
      provider: 'platform',
      operation: 'userContact',
      baseUrl: env.PLATFORM_BASE_URL,
      method: 'GET',
      path: `/internal/users/${userId}/contact`,
      headers: { 'x-internal-token': env.INTERNAL_API_TOKEN },
      timeoutMs: 3_000,
    });
  },
};

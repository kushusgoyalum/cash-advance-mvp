import { env } from '@common/index.js';
import { httpJson } from '../../http.js';
import type { BureauProvider, BureauSummary } from '../bureau.port.js';

export const httpBureauProvider: BureauProvider = {
  async pullReport({ userId, consentRef }) {
    const raw = await httpJson<{ summary: BureauSummary }>({
      provider: 'bureau',
      operation: 'hardPull',
      baseUrl: env.BUREAU_BASE_URL,
      method: 'POST',
      path: '/reports',
      body: { customerRef: userId, consentRef },
      timeoutMs: 15_000,
    });
    return { summary: raw.summary, raw };
  },
};

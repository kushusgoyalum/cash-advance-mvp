import type { BureauProvider } from '../bureau.port.js';

export const mockBureauProvider: BureauProvider = {
  async pullReport() {
    return { summary: { bureau: 'MOCK', score: 742, dpd90PlusLast12m: 0, writtenOffAccounts: 0, enquiriesLast30d: 1 }, raw: {} };
  },
};

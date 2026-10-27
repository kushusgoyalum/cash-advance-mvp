import { env } from '@common/index.js';
import type { BureauProvider } from './bureau.port.js';
import { httpBureauProvider } from './providers/httpBureau.adapter.js';
import { mockBureauProvider } from './providers/mockBureau.adapter.js';

export const getBureauProvider = (): BureauProvider => (env.USE_MOCK_PROVIDERS ? mockBureauProvider : httpBureauProvider);

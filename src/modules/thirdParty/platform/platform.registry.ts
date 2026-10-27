import { env } from '@common/index.js';
import type { PlatformClient } from './platform.port.js';
import { httpPlatformClient } from './providers/httpPlatform.adapter.js';
import { mockPlatformClient } from './providers/mockPlatform.adapter.js';

export const getPlatformClient = (): PlatformClient => (env.USE_MOCK_PROVIDERS ? mockPlatformClient : httpPlatformClient);

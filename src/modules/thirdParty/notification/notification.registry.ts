import { env } from '@common/index.js';
import type { MessagingProvider, PushProvider } from './notification.port.js';
import { karixProvider } from './providers/karix.adapter.js';
import { mockMessagingProvider, mockPushProvider } from './providers/mockMessaging.adapter.js';

export const getMessagingProvider = (): MessagingProvider => (env.USE_MOCK_PROVIDERS ? mockMessagingProvider : karixProvider);

/** Push delivery is owned by the existing platform push service (device tokens live there). */
export const getPushProvider = (): PushProvider => mockPushProvider;

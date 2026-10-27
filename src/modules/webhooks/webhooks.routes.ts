import { Autowired } from '@routes/autowired.js';
import { ApiModule, ApiPrefix } from '@routes/routes.enum.js';
import { bankWebhookController } from './controllers/bankWebhook.controller.js';

/** No JWT here — authenticity comes from the HMAC signature (+ IP allowlist at the edge). */
export const webhooksRoutes = Autowired({ module: ApiModule.WEBHOOKS, prefix: ApiPrefix.WEBHOOKS })([bankWebhookController]);

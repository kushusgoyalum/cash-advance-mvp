import type { FastifyReply, FastifyRequest } from 'fastify';
import { env, sendSuccess, verifyWebhookSignature } from '@common/index.js';
import type { RouteController } from '@routes/autowired.js';
import { ingestBankWebhook } from '../webhooks.service.js';
import { type BankWebhookBody, bankWebhookSchema } from './schemas/index.js';

/** POST /webhooks/v1/banking — HMAC(timestamp.rawBody) + 5-min replay window, then inbox. */
export const bankWebhookController = {
  route: { method: 'POST', path: '/banking' },
  schema: { ...bankWebhookSchema, tags: ['webhooks'] },
  handler: async (request: FastifyRequest<{ Body: BankWebhookBody }>, reply: FastifyReply) => {
    verifyWebhookSignature({
      secret: env.BANK_WEBHOOK_SECRET,
      rawBody: request.rawBody,
      signature: request.headers['x-signature'] as string | undefined,
      timestamp: request.headers['x-timestamp'] as string | undefined,
    });
    return sendSuccess(reply, await ingestBankWebhook(request.body));
  },
} satisfies RouteController;

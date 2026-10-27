import type { FastifyReply, FastifyRequest } from 'fastify';
import { HttpStatus, requireUser, sendSuccess, withIdempotency } from '@common/index.js';
import type { RouteController } from '@routes/autowired.js';
import { cancelApplication } from '../application.service.js';
import { type ApplicationIdParams, cancelApplicationSchema } from './schemas/index.js';

/** POST /v1/cash-advance/applications/:id/cancel — only before the payout starts. */
export const cancelApplicationController = {
  route: { method: 'POST', path: '/applications/:id/cancel' },
  schema: { ...cancelApplicationSchema, tags: ['application'] },
  handler: async (request: FastifyRequest<{ Params: ApplicationIdParams }>, reply: FastifyReply) => {
    const { userId } = requireUser(request);
    const result = await withIdempotency(
      { userId: userId.toString(), key: request.headers['idempotency-key'] as string | undefined, endpoint: `POST /applications/${request.params.id}/cancel`, body: null },
      async () => ({ statusCode: HttpStatus.OK, body: await cancelApplication(userId, request.params.id) }),
    );
    return sendSuccess(reply, result.body, result.statusCode);
  },
} satisfies RouteController;

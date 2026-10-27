import type { FastifyReply, FastifyRequest } from 'fastify';
import { HttpStatus, requireUser, sendSuccess, withIdempotency } from '@common/index.js';
import type { RouteController } from '@routes/autowired.js';
import { submitApplication } from '../application.service.js';
import { type ApplicationIdParams, type SubmitApplicationBody, submitApplicationSchema } from './schemas/index.js';

/** POST /v1/cash-advance/applications/:id/submit → 202 SUBMITTED (decision runs async). */
export const submitApplicationController = {
  route: { method: 'POST', path: '/applications/:id/submit' },
  schema: { ...submitApplicationSchema, tags: ['application'] },
  handler: async (request: FastifyRequest<{ Params: ApplicationIdParams; Body: SubmitApplicationBody }>, reply: FastifyReply) => {
    const { userId } = requireUser(request);
    const result = await withIdempotency(
      {
        userId: userId.toString(),
        key: request.headers['idempotency-key'] as string | undefined,
        endpoint: `POST /applications/${request.params.id}/submit`,
        body: request.body.consents,
      },
      async () => ({
        statusCode: HttpStatus.ACCEPTED,
        body: await submitApplication(userId, request.params.id, {
          consents: request.body.consents,
          stepUpToken: request.body.stepUpToken,
          ip: request.ip,
          requestId: request.id,
        }),
      }),
    );
    return sendSuccess(reply, result.body, result.statusCode);
  },
} satisfies RouteController;

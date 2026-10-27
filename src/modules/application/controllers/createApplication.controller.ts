import type { FastifyReply, FastifyRequest } from 'fastify';
import { HttpStatus, requireUser, sendSuccess, withIdempotency } from '@common/index.js';
import type { RouteController } from '@routes/autowired.js';
import { createDraft } from '../application.service.js';
import { type CreateApplicationBody, createApplicationSchema } from './schemas/index.js';

/** POST /v1/cash-advance/applications (Idempotency-Key) → 201 DRAFT with locked quote + KFS. */
export const createApplicationController = {
  route: { method: 'POST', path: '/applications' },
  schema: { ...createApplicationSchema, tags: ['application'] },
  handler: async (request: FastifyRequest<{ Body: CreateApplicationBody }>, reply: FastifyReply) => {
    const { userId } = requireUser(request);
    const result = await withIdempotency(
      { userId: userId.toString(), key: request.headers['idempotency-key'] as string | undefined, endpoint: 'POST /applications', body: request.body },
      async () => ({
        statusCode: HttpStatus.CREATED,
        body: await createDraft(userId, {
          amountPaise: BigInt(request.body.amount),
          tenureDays: request.body.tenureDays,
          snapshotId: BigInt(request.body.snapshotId),
        }),
      }),
    );
    return sendSuccess(reply, result.body, result.statusCode);
  },
} satisfies RouteController;

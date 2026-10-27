import type { FastifyReply, FastifyRequest } from 'fastify';
import { requireUser, sendSuccess } from '@common/index.js';
import type { RouteController } from '@routes/autowired.js';
import { getApplicationForUser } from '../application.service.js';
import { type ApplicationIdParams, applicationIdParams } from './schemas/index.js';

/** GET /v1/cash-advance/applications/:id — ownership enforced in the query. */
export const getApplicationController = {
  route: { method: 'GET', path: '/applications/:id' },
  schema: { params: applicationIdParams, tags: ['application'] },
  handler: async (request: FastifyRequest<{ Params: ApplicationIdParams }>, reply: FastifyReply) => {
    const { userId } = requireUser(request);
    return sendSuccess(reply, await getApplicationForUser(userId, request.params.id));
  },
} satisfies RouteController;

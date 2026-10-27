import type { FastifyReply, FastifyRequest } from 'fastify';
import { requireUser, sendSuccess } from '@common/index.js';
import type { RouteController } from '@routes/autowired.js';
import { listApplicationsForUser } from '../application.service.js';
import { type ListApplicationsQuery, listApplicationsSchema } from './schemas/index.js';

/** GET /v1/cash-advance/applications?status=&cursor=&limit= */
export const listApplicationsController = {
  route: { method: 'GET', path: '/applications' },
  schema: { ...listApplicationsSchema, tags: ['application'] },
  handler: async (request: FastifyRequest<{ Querystring: ListApplicationsQuery }>, reply: FastifyReply) => {
    const { userId } = requireUser(request);
    const { status, cursor, limit } = request.query;
    return sendSuccess(reply, await listApplicationsForUser(userId, { status, cursor, limit }));
  },
} satisfies RouteController;

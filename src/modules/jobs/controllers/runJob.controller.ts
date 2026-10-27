import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError, ErrorCodes, HttpStatus, sendSuccess } from '@common/index.js';
import type { RouteController } from '@routes/autowired.js';
import { runDailyJobByName } from '../scheduler.js';

const schema = {
  params: z.object({ job: z.string().min(3) }),
  body: z.object({ businessDate: z.iso.date().optional() }),
};

/** POST /internal/v1/cash-advance/jobs/:job/run — EventBridge / on-call trigger, idempotent per date. */
export const runJobController = {
  route: { method: 'POST', path: '/jobs/:job/run' },
  schema: { ...schema, tags: ['internal'] },
  handler: async (request: FastifyRequest<{ Params: { job: string }; Body: { businessDate?: string } }>, reply: FastifyReply) => {
    const result = await runDailyJobByName(request.params.job, request.body.businessDate);
    if (result === null) throw new AppError(ErrorCodes.NOT_FOUND, HttpStatus.NOT_FOUND, { job: request.params.job });
    return sendSuccess(reply, { job: request.params.job, result });
  },
} satisfies RouteController;

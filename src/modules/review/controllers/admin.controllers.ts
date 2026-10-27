import type { FastifyReply, FastifyRequest } from 'fastify';
import { HttpStatus, requireOps, requireOpsRole, sendSuccess, withIdempotency } from '@common/index.js';
import type { AdvanceStatus } from '@modules/application/index.js';
import type { RouteController } from '@routes/autowired.js';
import * as service from '../review.service.js';
import {
  type AdminIdParams,
  adminIdParams,
  type ApproveBody,
  approveSchema,
  type KillSwitchBody,
  killSwitchSchema,
  type RejectBody,
  rejectSchema,
  type RepaymentsQuery,
  repaymentsSchema,
  type RetryBody,
  retrySchema,
  type SearchQuery,
  searchSchema,
} from './schemas/index.js';

const idemKey = (r: FastifyRequest): string | undefined => r.headers['idempotency-key'] as string | undefined;

/** GET /admin/v1/cash-advance/applications (VIEWER+) */
export const searchApplicationsController = {
  route: { method: 'GET', path: '/applications' },
  schema: { ...searchSchema, tags: ['admin'] },
  preHandler: requireOpsRole('VIEWER'),
  handler: async (request: FastifyRequest<{ Querystring: SearchQuery }>, reply: FastifyReply) =>
    sendSuccess(reply, await service.searchApplications({ ...request.query, status: request.query.status as AdvanceStatus | undefined })),
} satisfies RouteController;

/** GET /admin/v1/cash-advance/applications/:id (VIEWER+) */
export const getApplicationDetailsController = {
  route: { method: 'GET', path: '/applications/:id' },
  schema: { params: adminIdParams, tags: ['admin'] },
  preHandler: requireOpsRole('VIEWER'),
  handler: async (request: FastifyRequest<{ Params: AdminIdParams }>, reply: FastifyReply) =>
    sendSuccess(reply, await service.getApplicationDetails(request.params.id)),
} satisfies RouteController;

/** POST /admin/v1/cash-advance/applications/:id/approve (REVIEWER+) */
export const approveApplicationController = {
  route: { method: 'POST', path: '/applications/:id/approve' },
  schema: { ...approveSchema, tags: ['admin'] },
  preHandler: requireOpsRole('REVIEWER'),
  handler: async (request: FastifyRequest<{ Params: AdminIdParams; Body: ApproveBody }>, reply: FastifyReply) => {
    const ops = requireOps(request);
    const r = await withIdempotency(
      { userId: `ops:${ops.opsUserId}`, key: idemKey(request), endpoint: `approve:${request.params.id}`, body: request.body },
      async () => ({ statusCode: HttpStatus.OK, body: await service.approveApplication(ops, request.params.id, request.body) }),
    );
    return sendSuccess(reply, r.body, r.statusCode);
  },
} satisfies RouteController;

/** POST /admin/v1/cash-advance/applications/:id/reject (REVIEWER+) */
export const rejectApplicationController = {
  route: { method: 'POST', path: '/applications/:id/reject' },
  schema: { ...rejectSchema, tags: ['admin'] },
  preHandler: requireOpsRole('REVIEWER'),
  handler: async (request: FastifyRequest<{ Params: AdminIdParams; Body: RejectBody }>, reply: FastifyReply) => {
    const ops = requireOps(request);
    const r = await withIdempotency(
      { userId: `ops:${ops.opsUserId}`, key: idemKey(request), endpoint: `reject:${request.params.id}`, body: request.body },
      async () => ({ statusCode: HttpStatus.OK, body: await service.rejectApplication(ops, request.params.id, request.body) }),
    );
    return sendSuccess(reply, r.body, r.statusCode);
  },
} satisfies RouteController;

/** POST /admin/v1/cash-advance/applications/:id/disbursement/retry (SUPERVISOR+) */
export const retryDisbursementController = {
  route: { method: 'POST', path: '/applications/:id/disbursement/retry' },
  schema: { ...retrySchema, tags: ['admin'] },
  preHandler: requireOpsRole('SUPERVISOR'),
  handler: async (request: FastifyRequest<{ Params: AdminIdParams; Body: RetryBody }>, reply: FastifyReply) => {
    const ops = requireOps(request);
    const r = await withIdempotency(
      { userId: `ops:${ops.opsUserId}`, key: idemKey(request), endpoint: `retry:${request.params.id}`, body: request.body },
      async () => ({ statusCode: HttpStatus.ACCEPTED, body: await service.retryDisbursement(ops, request.params.id, request.body.note) }),
    );
    return sendSuccess(reply, r.body, r.statusCode);
  },
} satisfies RouteController;

/** GET /admin/v1/cash-advance/applications/:id/audit (VIEWER+) */
export const getAuditHistoryController = {
  route: { method: 'GET', path: '/applications/:id/audit' },
  schema: { params: adminIdParams, tags: ['admin'] },
  preHandler: requireOpsRole('VIEWER'),
  handler: async (request: FastifyRequest<{ Params: AdminIdParams }>, reply: FastifyReply) =>
    sendSuccess(reply, await service.getAuditHistory(request.params.id)),
} satisfies RouteController;

/** GET /admin/v1/cash-advance/repayments?dueDate=&status= (VIEWER+) */
export const listRepaymentsController = {
  route: { method: 'GET', path: '/repayments' },
  schema: { ...repaymentsSchema, tags: ['admin'] },
  preHandler: requireOpsRole('VIEWER'),
  handler: async (request: FastifyRequest<{ Querystring: RepaymentsQuery }>, reply: FastifyReply) =>
    sendSuccess(reply, await service.listRepayments(request.query)),
} satisfies RouteController;

/** POST /admin/v1/cash-advance/kill-switches (ADMIN) */
export const killSwitchController = {
  route: { method: 'POST', path: '/kill-switches' },
  schema: { ...killSwitchSchema, tags: ['admin'] },
  preHandler: requireOpsRole('ADMIN'),
  handler: async (request: FastifyRequest<{ Body: KillSwitchBody }>, reply: FastifyReply) =>
    sendSuccess(reply, await service.setKillSwitch(requireOps(request), request.body.switch, request.body.paused, request.body.reason)),
} satisfies RouteController;

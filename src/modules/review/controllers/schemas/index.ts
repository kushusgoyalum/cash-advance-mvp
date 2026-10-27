import { z } from 'zod';

const idempotencyHeaders = z.looseObject({ 'idempotency-key': z.string().min(16).max(64) });
export const adminIdParams = z.object({ id: z.string().length(26) });

export const searchSchema = {
  querystring: z.object({
    status: z.string().optional(),
    userId: z.string().regex(/^\d+$/).optional(),
    publicId: z.string().length(26).optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    cursor: z.string().regex(/^\d+$/).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  }),
};

export const approveSchema = {
  headers: idempotencyHeaders,
  params: adminIdParams,
  body: z.object({ expectedVersion: z.number().int().positive(), note: z.string().min(3).max(500) }),
};

export const rejectSchema = {
  headers: idempotencyHeaders,
  params: adminIdParams,
  body: z.object({ expectedVersion: z.number().int().positive(), reasonCode: z.string().min(3).max(50), note: z.string().min(3).max(500) }),
};

export const retrySchema = { headers: idempotencyHeaders, params: adminIdParams, body: z.object({ note: z.string().min(3).max(500) }) };

export const repaymentsSchema = {
  querystring: z.object({
    dueDate: z.iso.date().optional(),
    status: z.enum(['PLANNED', 'IN_PROGRESS', 'SUCCESS', 'PARTIAL', 'NO_FUNDS', 'FAILED', 'SKIPPED_OUTAGE']).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  }),
};

export const killSwitchSchema = {
  body: z.object({ switch: z.enum(['NEW_APPLICATIONS', 'DISBURSEMENTS', 'COLLECTIONS']), paused: z.boolean(), reason: z.string().min(3) }),
};

export type SearchQuery = z.infer<typeof searchSchema.querystring>;
export type AdminIdParams = z.infer<typeof adminIdParams>;
export type ApproveBody = z.infer<typeof approveSchema.body>;
export type RejectBody = z.infer<typeof rejectSchema.body>;
export type RetryBody = z.infer<typeof retrySchema.body>;
export type RepaymentsQuery = z.infer<typeof repaymentsSchema.querystring>;
export type KillSwitchBody = z.infer<typeof killSwitchSchema.body>;

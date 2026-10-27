import { z } from 'zod';

const idempotencyHeaders = z.looseObject({ 'idempotency-key': z.string().min(16).max(64) });

export const createApplicationSchema = {
  headers: idempotencyHeaders,
  body: z.object({
    /** integer paise */
    amount: z.number().int().positive(),
    tenureDays: z.number().int().positive(),
    snapshotId: z.string().regex(/^\d+$/),
  }),
};

export const applicationIdParams = z.object({ id: z.string().length(26) });

export const submitApplicationSchema = {
  headers: idempotencyHeaders,
  params: applicationIdParams,
  body: z.object({
    consents: z.object({
      kfsAccepted: z.boolean(),
      bureauPullConsent: z.boolean(),
      debitAuthorization: z.boolean(),
    }),
    stepUpToken: z.string().min(10),
  }),
};

export const cancelApplicationSchema = { headers: idempotencyHeaders, params: applicationIdParams };

export const listApplicationsSchema = {
  querystring: z.object({
    status: z.enum(['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'DISBURSEMENT_PENDING', 'DISBURSEMENT_FAILED', 'DISBURSED', 'PARTIALLY_REPAID', 'OVERDUE', 'REPAID', 'CANCELLED', 'EXPIRED']).optional(),
    cursor: z.string().regex(/^\d+$/).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }),
};

export type CreateApplicationBody = z.infer<typeof createApplicationSchema.body>;
export type SubmitApplicationBody = z.infer<typeof submitApplicationSchema.body>;
export type ApplicationIdParams = z.infer<typeof applicationIdParams>;
export type ListApplicationsQuery = z.infer<typeof listApplicationsSchema.querystring>;

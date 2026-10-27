import { z } from 'zod';

/** Response contract (documentation + tests). Amounts are integer paise. */
export const eligibilityResponseSchema = z.object({
  eligible: z.boolean(),
  reasons: z.array(z.object({ code: z.string() })),
  tier: z.string().nullable(),
  maxAmount: z.number().int(),
  tenureOptionsDays: z.array(z.number().int()),
  fee: z.array(z.object({ tier: z.string(), upTo: z.number().int(), amount: z.number().int() })),
  eligibleFrom: z.string().nullable(),
  snapshotId: z.string(),
  validTill: z.string(),
});
export type EligibilityResponse = z.infer<typeof eligibilityResponseSchema>;

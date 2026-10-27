import { z } from 'zod';

export const bankWebhookSchema = {
  headers: z.looseObject({ 'x-signature': z.string().min(32), 'x-timestamp': z.string().regex(/^\d+$/) }),
  body: z.object({
    eventId: z.string().min(1).max(100),
    eventType: z.enum(['PAYOUT_STATUS', 'DEBIT_STATUS', 'CREDIT_RECEIVED']),
    data: z.record(z.string(), z.unknown()),
  }),
};
export type BankWebhookBody = z.infer<typeof bankWebhookSchema.body>;

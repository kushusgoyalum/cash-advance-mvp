import type { FastifyReply, FastifyRequest } from 'fastify';
import { paiseToNumber, requireUser, sendSuccess } from '@common/index.js';
import type { RouteController } from '@routes/autowired.js';
import { getEligibility } from '../eligibility.service.js';
import type { EligibilityResponse } from './schemas/index.js';

/** GET /v1/cash-advance/eligibility */
export const getEligibilityController = {
  route: { method: 'GET', path: '/eligibility' },
  schema: { tags: ['eligibility'] },
  handler: async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId } = requireUser(request);
    const v = await getEligibility(userId);
    const body: EligibilityResponse = {
      eligible: v.eligible,
      reasons: v.reasons.map((code) => ({ code })),
      tier: v.tier,
      maxAmount: paiseToNumber(v.maxAmountPaise),
      tenureOptionsDays: v.tenureOptionsDays,
      fee: v.feeSchedule.map((f) => ({ tier: f.tier, upTo: paiseToNumber(f.upToPaise), amount: paiseToNumber(f.feePaise) })),
      eligibleFrom: v.eligibleFrom,
      snapshotId: v.snapshotId.toString(),
      validTill: v.validTill.toISOString(),
    };
    return sendSuccess(reply, body);
  },
} satisfies RouteController;

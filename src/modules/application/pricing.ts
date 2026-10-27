import { addDays, AppError, ErrorCodes, flatFeeAprBps, HttpStatus, istBusinessDate, nextBusinessDay } from '@common/index.js';
import { findTier, type ProductConfigView } from '@modules/eligibility/index.js';
import type { Quote } from './application.types.js';

/**
 * Locked quote shown in the KFS: flat fee per tier, total, APR and an INDICATIVE due date.
 * The final due date is fixed at disbursal (disbursal date + tenure).
 */
export const computeQuote = (args: {
  amountPaise: bigint;
  tenureDays: number;
  tier: string;
  config: ProductConfigView;
  now?: Date;
}): Quote => {
  const { amountPaise, tenureDays, tier, config } = args;
  if (!config.tenureOptionsDays.includes(tenureDays)) throw new AppError(ErrorCodes.INVALID_TENURE, HttpStatus.UNPROCESSABLE_ENTITY);
  if (amountPaise < config.minAmountPaise || amountPaise > config.maxAmountPaise) {
    throw new AppError(ErrorCodes.AMOUNT_EXCEEDS_LIMIT, HttpStatus.UNPROCESSABLE_ENTITY);
  }
  const tierConfig = findTier(config, tier);
  if (!tierConfig) throw new AppError(ErrorCodes.NOT_ELIGIBLE, HttpStatus.UNPROCESSABLE_ENTITY, { tier });
  const feePaise = tierConfig.feePaise;
  return {
    principalPaise: amountPaise,
    feePaise,
    totalRepayablePaise: amountPaise + feePaise,
    aprBps: flatFeeAprBps(feePaise, amountPaise, tenureDays),
    indicativeDueDate: nextBusinessDay(addDays(istBusinessDate(args.now ?? new Date()), tenureDays)),
  };
};

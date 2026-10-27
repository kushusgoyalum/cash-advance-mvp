import { fromDateOnly, paiseToNumber } from '@common/index.js';
import type { CashAdvance } from './application.types.js';

/** User-facing status: internal states are simplified for the app (design §3.3). */
const USER_STATUS: Record<CashAdvance['status'], string> = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED: 'APPROVED',
  DISBURSEMENT_PENDING: 'APPROVED',
  DISBURSEMENT_FAILED: 'APPROVED',
  DISBURSED: 'DISBURSED',
  PARTIALLY_REPAID: 'DISBURSED',
  OVERDUE: 'OVERDUE',
  REPAID: 'REPAID',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
};

const SUB_STATUS: Partial<Record<CashAdvance['status'], string>> = {
  DISBURSEMENT_PENDING: 'FUNDS_ON_THE_WAY',
  DISBURSEMENT_FAILED: 'FUNDS_DELAYED',
  PARTIALLY_REPAID: 'PARTIALLY_REPAID',
};

export const toAdvanceDto = (a: CashAdvance) => ({
  id: a.publicId,
  status: USER_STATUS[a.status],
  subStatus: SUB_STATUS[a.status] ?? null,
  principal: paiseToNumber(a.principalPaise),
  fee: paiseToNumber(a.feePaise),
  totalRepayable: paiseToNumber(a.totalRepayablePaise),
  collected: paiseToNumber(a.collectedPaise),
  outstanding: paiseToNumber(a.totalRepayablePaise - a.collectedPaise),
  tenureDays: a.tenureDays,
  apr: (a.aprBps / 100).toFixed(2),
  dueDate: a.dueDate ? fromDateOnly(a.dueDate) : null,
  disbursedAt: a.disbursedAt?.toISOString() ?? null,
  rejectionCode: a.rejectionCode,
  createdAt: a.createdAt.toISOString(),
  version: a.version,
});

export type AdvanceDto = ReturnType<typeof toAdvanceDto>;

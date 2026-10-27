import type { AdvanceStatus } from '@prisma/mysql-client';
import { addDays, BUSINESS, daysBetween, minPaise } from '@common/index.js';

/** Fee first, then principal (assumption A12). Any excess is flagged for refund by ops. */
export const allocateFeeFirst = (amountPaise: bigint, feeOutstandingPaise: bigint, principalOutstandingPaise: bigint) => {
  const feePart = minPaise(amountPaise, feeOutstandingPaise > 0n ? feeOutstandingPaise : 0n);
  const principalPart = minPaise(amountPaise - feePart, principalOutstandingPaise > 0n ? principalOutstandingPaise : 0n);
  return { feePart, principalPart, excess: amountPaise - feePart - principalPart };
};

export type DebitPlan = { action: 'FULL' | 'PARTIAL' | 'NONE'; amountPaise: bigint };

/** Collect min(balance, outstanding): full, partial, or nothing (no balance). */
export const planDebit = (balancePaise: bigint, outstandingPaise: bigint): DebitPlan => {
  if (outstandingPaise <= 0n || balancePaise <= 0n) return { action: 'NONE', amountPaise: 0n };
  if (balancePaise >= outstandingPaise) return { action: 'FULL', amountPaise: outstandingPaise };
  return { action: 'PARTIAL', amountPaise: balancePaise };
};

export interface CalendarSlot {
  seq: number;
  businessDate: string;
  time: string;
}

/**
 * Collection calendar relative to the due date D (IST):
 *   D at 07:00, 13:00, 19:00 → D+1..D+7 daily at 07:00 → every 3 days at 07:00 until D+30.
 * `seq` is stable, so UNIQUE(advance_id, attempt_seq) makes planning idempotent.
 */
export const buildCollectionCalendar = (dueDate: string): CalendarSlot[] => {
  const slots: CalendarSlot[] = [];
  let seq = 0;
  for (const time of BUSINESS.COLLECTION_SLOTS_ON_DUE_DATE) slots.push({ seq: ++seq, businessDate: dueDate, time });
  for (let d = 1; d <= BUSINESS.COLLECTION_DAILY_UNTIL_DAY; d += 1) slots.push({ seq: ++seq, businessDate: addDays(dueDate, d), time: '07:00' });
  for (
    let d = BUSINESS.COLLECTION_DAILY_UNTIL_DAY + BUSINESS.COLLECTION_EVERY_N_DAYS_AFTER;
    d <= BUSINESS.COLLECTION_STOP_AFTER_DAY;
    d += BUSINESS.COLLECTION_EVERY_N_DAYS_AFTER
  ) {
    slots.push({ seq: ++seq, businessDate: addDays(dueDate, d), time: '07:00' });
  }
  return slots;
};

export const slotsForDate = (dueDate: string, businessDate: string): CalendarSlot[] =>
  buildCollectionCalendar(dueDate).filter((s) => s.businessDate === businessDate);

/** At most one credit-triggered (event-driven) attempt per day, idempotent by seq. */
export const creditTriggeredSeq = (dueDate: string, businessDate: string): number => 1_000 + daysBetween(dueDate, businessDate);

/** Status after a successful (full or partial) collection. OVERDUE stays OVERDUE until REPAID. */
export const statusAfterCollection = (current: AdvanceStatus, outstandingAfterPaise: bigint): AdvanceStatus => {
  if (outstandingAfterPaise <= 0n) return 'REPAID';
  return current === 'DISBURSED' ? 'PARTIALLY_REPAID' : current;
};

/** Overdue reminder cadence: D+1, D+3, D+7, then weekly. */
export const isOverdueReminderDay = (daysOverdue: number): boolean =>
  daysOverdue === 1 || daysOverdue === 3 || daysOverdue === 7 || (daysOverdue > 7 && daysOverdue % 7 === 0);

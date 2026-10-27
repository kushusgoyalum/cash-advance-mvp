import { describe, expect, it } from 'vitest';
import {
  allocateFeeFirst,
  buildCollectionCalendar,
  creditTriggeredSeq,
  isOverdueReminderDay,
  planDebit,
  slotsForDate,
  statusAfterCollection,
} from '../collection.utils.js';

describe('planDebit (full / partial / none)', () => {
  it('full repayment when balance covers outstanding', () => {
    expect(planDebit(5_000_00n, 3_199_00n)).toEqual({ action: 'FULL', amountPaise: 3_199_00n });
  });
  it('partial when balance is lower', () => {
    expect(planDebit(1_000_00n, 3_199_00n)).toEqual({ action: 'PARTIAL', amountPaise: 1_000_00n });
  });
  it('none when balance is zero or nothing is owed', () => {
    expect(planDebit(0n, 3_199_00n).action).toBe('NONE');
    expect(planDebit(5_000_00n, 0n).action).toBe('NONE');
  });
});

describe('allocateFeeFirst', () => {
  it('pays the fee before principal', () => {
    expect(allocateFeeFirst(1_000_00n, 199_00n, 3_000_00n)).toEqual({ feePart: 199_00n, principalPart: 801_00n, excess: 0n });
  });
  it('flags over-collection as excess', () => {
    expect(allocateFeeFirst(4_000_00n, 0n, 3_000_00n)).toEqual({ feePart: 0n, principalPart: 3_000_00n, excess: 1_000_00n });
  });
});

describe('collection calendar', () => {
  const cal = buildCollectionCalendar('2026-11-10');
  it('has 3 slots on the due date, daily to D+7, then every 3 days to D+30', () => {
    expect(slotsForDate('2026-11-10', '2026-11-10').map((s) => s.time)).toEqual(['07:00', '13:00', '19:00']);
    expect(slotsForDate('2026-11-10', '2026-11-17')).toHaveLength(1); // D+7
    expect(slotsForDate('2026-11-10', '2026-11-18')).toHaveLength(0); // D+8 skipped
    expect(slotsForDate('2026-11-10', '2026-11-20')).toHaveLength(1); // D+10
    expect(cal.at(-1)?.businessDate).toBe('2026-12-08'); // D+28 is the last slot ≤ D+30
  });
  it('sequence numbers are unique and stable (planner idempotency)', () => {
    expect(new Set(cal.map((s) => s.seq)).size).toBe(cal.length);
    expect(buildCollectionCalendar('2026-11-10')).toEqual(cal);
  });
  it('credit-triggered attempts get one seq per day, outside the calendar range', () => {
    expect(creditTriggeredSeq('2026-11-10', '2026-11-12')).toBe(1_002);
  });
});

describe('statusAfterCollection', () => {
  it('REPAID when nothing is outstanding', () => expect(statusAfterCollection('OVERDUE', 0n)).toBe('REPAID'));
  it('DISBURSED → PARTIALLY_REPAID on partial', () => expect(statusAfterCollection('DISBURSED', 1n)).toBe('PARTIALLY_REPAID'));
  it('OVERDUE stays OVERDUE on partial', () => expect(statusAfterCollection('OVERDUE', 1n)).toBe('OVERDUE'));
});

describe('overdue reminder cadence', () => {
  it('D+1, D+3, D+7, then weekly', () => {
    expect([1, 2, 3, 7, 10, 14, 21].map(isOverdueReminderDay)).toEqual([true, false, true, true, false, true, true]);
  });
});

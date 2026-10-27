const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' business date in IST for the given instant. */
export const istBusinessDate = (at: Date = new Date()): string =>
  new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

/** UTC instant for an IST wall-clock time on a business date, e.g. ('2026-11-08','07:00'). */
export const istInstant = (businessDate: string, hhmm: string): Date =>
  new Date(new Date(`${businessDate}T${hhmm}:00.000Z`).getTime() - IST_OFFSET_MS);

export const addDays = (businessDate: string, days: number): string =>
  new Date(new Date(`${businessDate}T00:00:00.000Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);

export const daysBetween = (fromDate: string, toDate: string): number =>
  Math.round((new Date(`${toDate}T00:00:00Z`).getTime() - new Date(`${fromDate}T00:00:00Z`).getTime()) / DAY_MS);

export const toDateOnly = (businessDate: string): Date => new Date(`${businessDate}T00:00:00.000Z`);
export const fromDateOnly = (d: Date): string => d.toISOString().slice(0, 10);

const isWeekend = (businessDate: string): boolean => {
  const day = new Date(`${businessDate}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
};

/** Due dates falling on a weekend/holiday roll to the next business day (assumption A10). */
export const nextBusinessDay = (businessDate: string, holidays: ReadonlySet<string> = new Set()): string => {
  let d = businessDate;
  while (isWeekend(d) || holidays.has(d)) d = addDays(d, 1);
  return d;
};

export const hoursFromNow = (hours: number, now: Date = new Date()): Date => new Date(now.getTime() + hours * 3_600_000);
export const secondsFromNow = (seconds: number, now: Date = new Date()): Date => new Date(now.getTime() + seconds * 1000);

import { acquireLock, addDays, deleteExpiredKeys, istBusinessDate, logger } from '@common/index.js';
import { expireStaleDrafts } from '@modules/application/index.js';
import {
  dispatchDueAttempts,
  emitRepaymentReminders,
  markOverdue,
  planCollectionsForDate,
  sweepStuckAttempts,
} from '@modules/collection/index.js';
import { cacheEscrowBalance, sweepPayouts } from '@modules/disbursement/index.js';
import { retryPendingNotifications } from '@modules/notification/index.js';
import { expireReviewSla } from '@modules/review/index.js';
import { probeBankHealth } from '@modules/thirdParty/index.js';
import { sweepWebhookInbox } from '@modules/webhooks/index.js';
import { runDailyJob } from './jobs.service.js';
import { reconcile } from './reconciliation.js';

const LOW_ESCROW_ALERT_PAISE = 5_00_000_00n; // ₹5 lakh

interface IntervalJob {
  name: string;
  everyMs: number;
  run: () => Promise<unknown>;
}

interface DailyJob {
  name: string;
  /** IST wall-clock time. */
  atIst: string;
  /** Business date the run applies to (e.g. reconciliation runs for yesterday). */
  dateOffsetDays?: number;
  run: (businessDate: string) => Promise<unknown>;
}

export const INTERVAL_JOBS: IntervalJob[] = [
  {
    name: 'bank-health-probe',
    everyMs: 60_000,
    run: async () => {
      const r = await probeBankHealth();
      if (r.escrowBalancePaise !== null) {
        await cacheEscrowBalance(r.escrowBalancePaise);
        if (r.escrowBalancePaise < LOW_ESCROW_ALERT_PAISE) logger.error({ balance: r.escrowBalancePaise.toString() }, 'LOW_ESCROW_BALANCE');
      }
      return r.healthy;
    },
  },
  { name: 'collection-dispatch', everyMs: 5 * 60_000, run: () => dispatchDueAttempts() },
  { name: 'payout-sweeper', everyMs: 5 * 60_000, run: () => sweepPayouts() },
  { name: 'collection-sweeper', everyMs: 5 * 60_000, run: () => sweepStuckAttempts() },
  { name: 'webhook-inbox-sweeper', everyMs: 5 * 60_000, run: () => sweepWebhookInbox() },
  { name: 'notification-retry', everyMs: 10 * 60_000, run: () => retryPendingNotifications() },
  { name: 'draft-expiry', everyMs: 15 * 60_000, run: () => expireStaleDrafts() },
  { name: 'review-sla-expiry', everyMs: 15 * 60_000, run: () => expireReviewSla() },
];

export const DAILY_JOBS: DailyJob[] = [
  { name: 'reconciliation', atIst: '06:00', dateOffsetDays: -1, run: (d) => reconcile(d) },
  { name: 'collection-plan', atIst: '06:30', run: (d) => planCollectionsForDate(d) },
  { name: 'repayment-reminders', atIst: '09:00', run: (d) => emitRepaymentReminders(d) },
  { name: 'overdue-marking', atIst: '23:55', run: (d) => markOverdue(d) },
  { name: 'idempotency-purge', atIst: '03:00', run: () => deleteExpiredKeys(new Date()) },
];

/** Used by the scheduler tick AND the internal trigger route (EventBridge in production). */
export const runDailyJobByName = async (name: string, businessDate?: string) => {
  const job = DAILY_JOBS.find((j) => j.name === name);
  if (!job) return null;
  const date = businessDate ?? addDays(istBusinessDate(), job.dateOffsetDays ?? 0);
  return runDailyJob(job.name, date, () => job.run(date));
};

const istHHMM = (d: Date): string => new Date(d.getTime() + 330 * 60_000).toISOString().slice(11, 16);

/**
 * In-process scheduler (local / single-region). Interval jobs are single-flight across pods via
 * a Redis lock; daily jobs are additionally guarded by job_run(job, business_date).
 */
export const startScheduler = async (signal: AbortSignal): Promise<void> => {
  const lastRun = new Map<string, number>();
  while (!signal.aborted) {
    const now = new Date();
    for (const job of INTERVAL_JOBS) {
      if (now.getTime() - (lastRun.get(job.name) ?? 0) < job.everyMs) continue;
      lastRun.set(job.name, now.getTime());
      const lock = await acquireLock(`job:${job.name}`, job.everyMs).catch(() => null);
      if (!lock) continue; // another pod holds this tick
      void job.run().catch((err: unknown) => logger.error({ err, job: job.name }, 'interval job failed'));
    }
    for (const job of DAILY_JOBS) {
      if (istHHMM(now) >= job.atIst) {
        void runDailyJobByName(job.name).catch((err: unknown) => logger.error({ err, job: job.name }, 'daily job failed'));
      }
    }
    await new Promise((r) => setTimeout(r, 30_000));
  }
};

import { logger } from '@common/index.js';
import * as repo from './jobs.repo.js';

/** Runs a daily job at most once per business date (cron or manual trigger — same guard). */
export const runDailyJob = async (
  job: string,
  businessDate: string,
  fn: () => Promise<unknown>,
): Promise<'DONE' | 'SKIPPED' | 'FAILED'> => {
  await repo.deleteFailedRun(job, businessDate);
  const runId = await repo.tryStartJobRun(job, businessDate);
  if (runId === null) return 'SKIPPED';
  try {
    const stats = await fn();
    await repo.finishJobRun(runId, 'DONE', { result: JSON.parse(JSON.stringify(stats ?? null, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v))) });
    return 'DONE';
  } catch (err) {
    logger.error({ err, job, businessDate }, 'daily job failed');
    await repo.finishJobRun(runId, 'FAILED', { error: String(err) });
    return 'FAILED';
  }
};

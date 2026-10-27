import { getMySQLClient, isUniqueConstraintError } from '@database/index.js';

/** UNIQUE(job, business_date): a second trigger for the same day is a harmless no-op. */
export const tryStartJobRun = async (job: string, businessDate: string): Promise<bigint | null> => {
  try {
    return (await getMySQLClient().jobRun.create({ data: { job, businessDate } })).id;
  } catch (err) {
    if (isUniqueConstraintError(err)) return null;
    throw err;
  }
};

export const finishJobRun = (id: bigint, status: 'DONE' | 'FAILED', stats: object) =>
  getMySQLClient().jobRun.update({ where: { id }, data: { status, stats, finishedAt: new Date() } });

/** A FAILED run may be retried: clear it so the unique key can be taken again. */
export const deleteFailedRun = (job: string, businessDate: string) =>
  getMySQLClient().jobRun.deleteMany({ where: { job, businessDate, status: 'FAILED' } });

export const fetchPendingOutbox = (limit: number) =>
  getMySQLClient().outboxEvent.findMany({ where: { status: 'PENDING' }, orderBy: { id: 'asc' }, take: limit });

export const markOutboxPublished = (id: bigint) =>
  getMySQLClient().outboxEvent.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'PUBLISHED', publishedAt: new Date() } });

export const bumpOutboxAttempt = (id: bigint, failed: boolean) =>
  getMySQLClient().outboxEvent.update({ where: { id }, data: { attempts: { increment: 1 }, ...(failed ? { status: 'FAILED' } : {}) } });

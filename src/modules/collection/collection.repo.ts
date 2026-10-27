import type { Prisma } from '@prisma/mysql-client';
import { getMySQLClient } from '@database/index.js';

const REPAYABLE = ['DISBURSED', 'PARTIALLY_REPAID', 'OVERDUE'] as const;

export const findRepayableDueBetween = (from: Date, to: Date, cursor: bigint, limit: number) =>
  getMySQLClient().cashAdvance.findMany({
    where: { status: { in: [...REPAYABLE] }, dueDate: { gte: from, lte: to }, id: { gt: cursor } },
    select: { id: true, dueDate: true },
    orderBy: { id: 'asc' },
    take: limit,
  });

export const createAttempts = async (rows: Prisma.CollectionAttemptCreateManyInput[]): Promise<number> =>
  (await getMySQLClient().collectionAttempt.createMany({ data: rows, skipDuplicates: true })).count;

/** Claim PLANNED → IN_PROGRESS with a conditional update so two dispatchers never double-send. */
export const claimDueAttempts = async (now: Date, limit: number) => {
  const db = getMySQLClient();
  const due = await db.collectionAttempt.findMany({
    where: { status: 'PLANNED', scheduledFor: { lte: now } },
    select: { id: true },
    orderBy: { scheduledFor: 'asc' },
    take: limit,
  });
  const claimed: bigint[] = [];
  for (const a of due) {
    const r = await db.collectionAttempt.updateMany({ where: { id: a.id, status: 'PLANNED' }, data: { status: 'IN_PROGRESS' } });
    if (r.count === 1) claimed.push(a.id);
  }
  return claimed;
};

export const findAttempt = (id: bigint) => getMySQLClient().collectionAttempt.findUnique({ where: { id } });
export const findAttemptByClientRef = (clientRef: string) => getMySQLClient().collectionAttempt.findUnique({ where: { clientRef } });
export const updateAttempt = (id: bigint, data: Prisma.CollectionAttemptUpdateInput) =>
  getMySQLClient().collectionAttempt.update({ where: { id }, data });

export const findStuckAttempts = (olderThan: Date, limit: number) =>
  getMySQLClient().collectionAttempt.findMany({ where: { status: 'IN_PROGRESS', updatedAt: { lt: olderThan } }, take: limit });

export const findToMarkOverdue = (onOrBefore: Date, limit: number) =>
  getMySQLClient().cashAdvance.findMany({
    where: { status: { in: ['DISBURSED', 'PARTIALLY_REPAID'] }, dueDate: { lte: onOrBefore } },
    orderBy: { id: 'asc' },
    take: limit,
  });

/** Attempts that actually ran (not skipped because the bank was down) since the due date. */
export const countExecutedAttemptsSince = (advanceId: bigint, since: Date) =>
  getMySQLClient().collectionAttempt.count({
    where: { advanceId, scheduledFor: { gte: since }, status: { notIn: ['PLANNED', 'SKIPPED_OUTAGE'] } },
  });

export const findRepayableForUser = (userId: bigint) =>
  getMySQLClient().cashAdvance.findMany({ where: { userId, status: { in: [...REPAYABLE] } } });

export const findDueOn = (date: Date) =>
  getMySQLClient().cashAdvance.findMany({
    where: { status: { in: ['DISBURSED', 'PARTIALLY_REPAID'] }, dueDate: date },
    select: { id: true, userId: true, totalRepayablePaise: true, collectedPaise: true },
  });

export const findOverdue = (cursor: bigint, limit: number) =>
  getMySQLClient().cashAdvance.findMany({
    where: { status: 'OVERDUE', id: { gt: cursor } },
    select: { id: true, userId: true, dueDate: true, totalRepayablePaise: true, collectedPaise: true },
    orderBy: { id: 'asc' },
    take: limit,
  });

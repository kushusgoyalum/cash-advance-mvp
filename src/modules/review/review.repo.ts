import type { AdvanceStatus, CollectionStatus, Prisma } from '@prisma/mysql-client';
import { getMySQLClient, isUniqueConstraintError } from '@database/index.js';

/** Admin reads go to a read replica in production (separate client); same queries. */
export const searchAdvances = (f: {
  status?: AdvanceStatus | undefined;
  userId?: bigint | undefined;
  publicId?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  cursor?: bigint | undefined;
  limit: number;
}) => {
  const where: Prisma.CashAdvanceWhereInput = {
    ...(f.status ? { status: f.status } : {}),
    ...(f.userId ? { userId: f.userId } : {}),
    ...(f.publicId ? { publicId: f.publicId } : {}),
    ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
    ...(f.cursor ? { id: { lt: f.cursor } } : {}),
  };
  return getMySQLClient().cashAdvance.findMany({ where, orderBy: { id: 'desc' }, take: f.limit });
};

export const getDetails = (publicId: string) =>
  getMySQLClient().cashAdvance.findUnique({
    where: { publicId },
    include: {
      reviewTask: true,
      disbursement: true,
      collectionAttempts: { orderBy: { attemptSeq: 'asc' } },
      ledgerEntries: { orderBy: { id: 'asc' } },
      statusHistory: { orderBy: { id: 'asc' } },
    },
  });

export const createReviewTask = async (advanceId: bigint, slaDueAt: Date): Promise<void> => {
  try {
    await getMySQLClient().reviewTask.create({ data: { advanceId, slaDueAt } });
  } catch (err) {
    if (!isUniqueConstraintError(err)) throw err; // duplicate event → task already exists
  }
};

export const closeReviewTask = (advanceId: bigint, data: { decision: string; assignee: string; note: string | null; status: 'DONE' | 'EXPIRED' }) =>
  getMySQLClient().reviewTask.updateMany({ where: { advanceId, status: { in: ['OPEN', 'CLAIMED'] } }, data });

export const findSlaBreached = (now: Date, limit: number) =>
  getMySQLClient().reviewTask.findMany({ where: { status: { in: ['OPEN', 'CLAIMED'] }, slaDueAt: { lt: now } }, take: limit });

export const listRepayments = (f: { dueDate?: Date | undefined; status?: CollectionStatus | undefined; limit: number }) =>
  getMySQLClient().collectionAttempt.findMany({
    where: { ...(f.status ? { status: f.status } : {}), ...(f.dueDate ? { advance: { dueDate: f.dueDate } } : {}) },
    include: { advance: { select: { publicId: true, status: true, totalRepayablePaise: true, collectedPaise: true, dueDate: true } } },
    orderBy: { scheduledFor: 'desc' },
    take: f.limit,
  });

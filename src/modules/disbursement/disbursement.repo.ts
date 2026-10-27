import type { Prisma } from '@prisma/mysql-client';
import { getMySQLClient } from '@database/index.js';

export const createDisbursement = (data: Prisma.DisbursementUncheckedCreateInput) => getMySQLClient().disbursement.create({ data });

export const findById = (id: bigint) => getMySQLClient().disbursement.findUnique({ where: { id } });
export const findByAdvanceId = (advanceId: bigint) => getMySQLClient().disbursement.findUnique({ where: { advanceId } });
export const findByClientRef = (clientRef: string) => getMySQLClient().disbursement.findUnique({ where: { clientRef } });

export const updateDisbursement = (id: bigint, data: Prisma.DisbursementUpdateInput) =>
  getMySQLClient().disbursement.update({ where: { id }, data });

/** Sweeper input: in-flight payouts whose retry time has come, or that look stuck (>15 min). */
export const findDueForSweep = (now: Date, limit: number) =>
  getMySQLClient().disbursement.findMany({
    where: {
      status: { in: ['INITIATED', 'PENDING', 'UNKNOWN'] },
      OR: [{ nextRetryAt: { lte: now } }, { nextRetryAt: null, updatedAt: { lt: new Date(now.getTime() - 15 * 60_000) } }],
    },
    orderBy: { id: 'asc' },
    take: limit,
  });

/** APPROVED advances that never got a payout row (kill switch / low funds at approval time). */
export const findApprovedWithoutPayout = (olderThan: Date, limit: number) =>
  getMySQLClient().cashAdvance.findMany({
    where: { status: 'APPROVED', disbursement: null, updatedAt: { lt: olderThan } },
    select: { id: true },
    orderBy: { id: 'asc' },
    take: limit,
  });

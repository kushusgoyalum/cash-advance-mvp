import type { AdvanceStatus, Prisma } from '@prisma/mysql-client';
import { AppError, ErrorCodes, HttpStatus } from '@common/index.js';
import { getMySQLClient } from '@database/index.js';

export const createAdvance = (data: Prisma.CashAdvanceUncheckedCreateInput) => getMySQLClient().cashAdvance.create({ data });

export const findById = (id: bigint) => getMySQLClient().cashAdvance.findUnique({ where: { id } });

export const findByIdOrThrow = async (id: bigint) => {
  const row = await findById(id);
  if (!row) throw new AppError(ErrorCodes.NOT_FOUND, HttpStatus.NOT_FOUND);
  return row;
};

export const findByPublicId = (publicId: string) => getMySQLClient().cashAdvance.findUnique({ where: { publicId } });

/** Ownership is part of the query — another user's id simply returns NOT_FOUND (no IDOR leak). */
export const findForUser = (userId: bigint, publicId: string) =>
  getMySQLClient().cashAdvance.findFirst({ where: { publicId, userId } });

export const findActiveForUser = (userId: bigint) =>
  getMySQLClient().cashAdvance.findFirst({
    where: { userId, status: { notIn: ['REPAID', 'REJECTED', 'CANCELLED', 'EXPIRED'] } },
  });

export const listForUser = (userId: bigint, opts: { status?: AdvanceStatus | undefined; cursor?: bigint | undefined; limit: number }) =>
  getMySQLClient().cashAdvance.findMany({
    where: { userId, ...(opts.status ? { status: opts.status } : {}), ...(opts.cursor ? { id: { lt: opts.cursor } } : {}) },
    orderBy: { id: 'desc' },
    take: opts.limit,
  });

export const conditionalUpdate = async (
  id: bigint,
  from: AdvanceStatus,
  expectedVersion: number | undefined,
  data: Prisma.CashAdvanceUpdateManyMutationInput,
): Promise<number> => {
  const res = await getMySQLClient().cashAdvance.updateMany({
    where: { id, status: from, ...(expectedVersion !== undefined ? { version: expectedVersion } : {}) },
    data: { ...data, version: { increment: 1 } },
  });
  return res.count;
};

export const insertHistory = (data: Prisma.StatusHistoryUncheckedCreateInput) => getMySQLClient().statusHistory.create({ data });

export const listHistory = (advanceId: bigint) =>
  getMySQLClient().statusHistory.findMany({ where: { advanceId }, orderBy: { id: 'asc' } });

export const findExpiredDrafts = (now: Date, limit: number) =>
  getMySQLClient().cashAdvance.findMany({ where: { status: 'DRAFT', draftExpiresAt: { lt: now } }, take: limit, select: { id: true } });

/** Row lock used by money flows (collection) to serialise work on one advance. */
export const lockForUpdate = async (id: bigint): Promise<void> => {
  await getMySQLClient().$queryRaw`SELECT id FROM cash_advance WHERE id = ${id} FOR UPDATE`;
};

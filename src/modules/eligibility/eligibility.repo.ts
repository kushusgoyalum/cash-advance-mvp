import type { AdvanceStatus, Prisma } from '@prisma/mysql-client';
import { getMongoDBClient, getMySQLClient } from '@database/index.js';
import type { AdvanceFlags } from './eligibility.types.js';

const TERMINAL: AdvanceStatus[] = ['REPAID', 'REJECTED', 'CANCELLED', 'EXPIRED'];

/**
 * Read-only query on `cash_advance` (owned by the application module). Eligibility only
 * reads aggregate flags; it never writes advances.
 */
export const getAdvanceFlags = async (userId: bigint, excludeAdvanceId?: bigint): Promise<AdvanceFlags> => {
  const db = getMySQLClient();
  const notThis = excludeAdvanceId !== undefined ? { id: { not: excludeAdvanceId } } : {};
  const [active, overdue, lastRejected, repaid] = await Promise.all([
    db.cashAdvance.count({ where: { userId, status: { notIn: TERMINAL }, ...notThis } }),
    db.cashAdvance.count({ where: { userId, status: 'OVERDUE' } }),
    db.cashAdvance.findFirst({ where: { userId, status: 'REJECTED' }, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
    db.cashAdvance.count({ where: { userId, status: 'REPAID' } }),
  ]);
  return { hasActiveAdvance: active > 0, hasOverdueAdvance: overdue > 0, lastRejectedAt: lastRejected?.updatedAt ?? null, priorRepaidCount: repaid };
};

export const createSnapshot = (data: Prisma.EligibilitySnapshotCreateInput) => getMySQLClient().eligibilitySnapshot.create({ data });

export const findSnapshot = (id: bigint) => getMySQLClient().eligibilitySnapshot.findUnique({ where: { id } });

export const findRecentBureauReport = (userId: string, since: Date) =>
  getMongoDBClient().bureauReport.findFirst({ where: { userId, pulledAt: { gte: since } }, orderBy: { pulledAt: 'desc' } });

export const saveBureauReport = (data: { userId: string; bureau: string; consentRef: string; summary: object; raw: object }) =>
  getMongoDBClient().bureauReport.create({ data });

export const saveBreEvaluation = async (data: {
  userId: string;
  advanceId: string | null;
  stage: string;
  ruleSetVersion: string;
  facts: object;
  ruleResults: object;
  decision: string;
  tier: string | null;
}): Promise<string> => (await getMongoDBClient().breEvaluation.create({ data })).id;

import type { Prisma } from '@prisma/mysql-client';
import { getMySQLClient } from '@database/index.js';

/** skipDuplicates + UNIQUE(reference, account, direction) ⇒ re-posting the same movement is a no-op. */
export const insertEntries = async (entries: Prisma.LedgerEntryCreateManyInput[]): Promise<void> => {
  await getMySQLClient().ledgerEntry.createMany({ data: entries, skipDuplicates: true });
};

export const listForAdvance = (advanceId: bigint) =>
  getMySQLClient().ledgerEntry.findMany({ where: { advanceId }, orderBy: { id: 'asc' } });

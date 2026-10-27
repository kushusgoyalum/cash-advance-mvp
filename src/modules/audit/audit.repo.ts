import { getMySQLClient } from '@database/index.js';

export const findLastHash = async (entityType: string, entityId: string): Promise<string | null> => {
  const last = await getMySQLClient().auditLog.findFirst({
    where: { entityType, entityId },
    orderBy: { id: 'desc' },
    select: { hash: true },
  });
  return last?.hash ?? null;
};

export const insertAudit = (data: Parameters<ReturnType<typeof getMySQLClient>['auditLog']['create']>[0]['data']) =>
  getMySQLClient().auditLog.create({ data });

export const listForEntity = (entityType: string, entityId: string) =>
  getMySQLClient().auditLog.findMany({ where: { entityType, entityId }, orderBy: { id: 'asc' } });

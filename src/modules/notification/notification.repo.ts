import type { Notification, Prisma } from '@prisma/mysql-client';
import { getMySQLClient, isUniqueConstraintError } from '@database/index.js';

/** UNIQUE(dedupe_key) ⇒ a redelivered event never creates (or sends) a second message. */
export const createIfAbsent = async (data: Prisma.NotificationUncheckedCreateInput): Promise<Notification | null> => {
  try {
    return await getMySQLClient().notification.create({ data });
  } catch (err) {
    if (isUniqueConstraintError(err)) return null;
    throw err;
  }
};

export const update = (id: bigint, data: Prisma.NotificationUpdateInput) => getMySQLClient().notification.update({ where: { id }, data });

export const findRetryable = (olderThan: Date, maxAttempts: number, limit: number) =>
  getMySQLClient().notification.findMany({
    where: { status: 'PENDING', attempts: { lt: maxAttempts }, updatedAt: { lt: olderThan } },
    orderBy: { id: 'asc' },
    take: limit,
  });

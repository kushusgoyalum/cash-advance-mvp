import { getMongoDBClient, isUniqueConstraintError } from '@database/index.js';

/** Durable inbox; UNIQUE(providerEventId) dedupes provider retries. Returns null on duplicate. */
export const insertInbox = async (data: { provider: string; providerEventId: string; eventType: string; payload: object }) => {
  try {
    return await getMongoDBClient().webhookInbox.create({ data });
  } catch (err) {
    if (isUniqueConstraintError(err)) return null;
    throw err;
  }
};

export const findInbox = (id: string) => getMongoDBClient().webhookInbox.findUnique({ where: { id } });

export const markInbox = (id: string, data: { status: string; attempts?: { increment: number }; failureReason?: string | null; processedAt?: Date }) =>
  getMongoDBClient().webhookInbox.update({ where: { id }, data });

export const findUnprocessed = (olderThan: Date, limit: number) =>
  getMongoDBClient().webhookInbox.findMany({ where: { status: 'RECEIVED', receivedAt: { lt: olderThan } }, take: limit });

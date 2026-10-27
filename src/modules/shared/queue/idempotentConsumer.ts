import { getMySQLClient, isUniqueConstraintError, runTransactional } from '@database/index.js';

/**
 * Consumer-side dedupe for side effects that live in OUR database: the marker row and the
 * handler's writes commit together, so a redelivered message is a no-op.
 * (Handlers that call external providers additionally rely on deterministic client refs.)
 */
export const processOnce = async (messageKey: string, fn: () => Promise<void>): Promise<'PROCESSED' | 'DUPLICATE'> => {
  try {
    await runTransactional(async () => {
      await getMySQLClient().processedMessage.create({ data: { messageKey } });
      await fn();
    });
    return 'PROCESSED';
  } catch (err) {
    if (isUniqueConstraintError(err)) return 'DUPLICATE';
    throw err;
  }
};

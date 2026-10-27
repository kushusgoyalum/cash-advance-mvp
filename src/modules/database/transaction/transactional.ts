import { Prisma } from '@prisma/mysql-client';
import { getMySQLRootClient } from '../clients/mysql.client.js';
import { dbTransactionContext } from './transactionContext.js';

export interface TransactionalOptions {
  timeoutMs?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

/**
 * Runs `fn` in one MySQL transaction. Nested calls join the outer transaction, so a
 * service can compose repo calls + state transition + audit + outbox atomically.
 */
export const runTransactional = <T>(fn: () => Promise<T>, options: TransactionalOptions = {}): Promise<T> => {
  if (dbTransactionContext.get()) return fn();
  return getMySQLRootClient().$transaction((tx) => dbTransactionContext.run({ mysql: tx }, fn), {
    timeout: options.timeoutMs ?? 10_000,
    isolationLevel: options.isolationLevel ?? Prisma.TransactionIsolationLevel.ReadCommitted,
  });
};

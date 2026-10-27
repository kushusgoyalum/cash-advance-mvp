import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma } from '@prisma/mysql-client';

export interface DbTransactionContext {
  mysql: Prisma.TransactionClient;
}

const storage = new AsyncLocalStorage<DbTransactionContext>();

/** Carries the active MySQL transaction through async calls so repos join it implicitly. */
export const dbTransactionContext = {
  run<T>(context: DbTransactionContext, fn: () => T): T {
    return storage.run(context, fn);
  },
  get(): DbTransactionContext | undefined {
    return storage.getStore();
  },
};

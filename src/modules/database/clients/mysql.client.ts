import { Prisma, PrismaClient } from '@prisma/mysql-client';
import { dbTransactionContext } from '../transaction/transactionContext.js';

export type MySQLClientLike = Prisma.TransactionClient;

let root: PrismaClient | undefined;

export const getMySQLRootClient = (): PrismaClient => {
  root ??= new PrismaClient();
  return root;
};

/**
 * Transaction-aware client: inside `runTransactional()` this returns the transaction
 * client, so every repo call made by a service joins the same DB transaction.
 */
export const getMySQLClient = (): MySQLClientLike => dbTransactionContext.get()?.mysql ?? getMySQLRootClient();

export const disconnectMySQL = async (): Promise<void> => {
  await root?.$disconnect();
  root = undefined;
};

/** Unique-constraint violation (P2002) — used as the final guard for idempotency. */
export const isUniqueConstraintError = (err: unknown): boolean =>
  (err instanceof Prisma.PrismaClientKnownRequestError || (typeof err === 'object' && err !== null && 'code' in err)) &&
  (err as { code?: string }).code === 'P2002';

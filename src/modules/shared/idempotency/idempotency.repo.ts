import { getMySQLRootClient, isUniqueConstraintError } from '@database/index.js';

/** Uses the ROOT client on purpose: the claim must commit before the business transaction runs. */
export const tryClaimKey = async (row: {
  userId: string;
  key: string;
  endpoint: string;
  requestHash: string;
  expiresAt: Date;
}): Promise<boolean> => {
  try {
    await getMySQLRootClient().idempotencyKey.create({ data: row });
    return true;
  } catch (err) {
    if (isUniqueConstraintError(err)) return false;
    throw err;
  }
};

export const findKey = (userId: string, key: string) =>
  getMySQLRootClient().idempotencyKey.findUnique({ where: { userId_key: { userId, key } } });

export const completeKey = async (userId: string, key: string, responseCode: number, responseBody: unknown): Promise<void> => {
  await getMySQLRootClient().idempotencyKey.update({
    where: { userId_key: { userId, key } },
    data: { status: 'DONE', responseCode, responseBody: responseBody as object },
  });
};

export const releaseKey = async (userId: string, key: string): Promise<void> => {
  await getMySQLRootClient().idempotencyKey.delete({ where: { userId_key: { userId, key } } });
};

export const deleteExpiredKeys = async (now: Date): Promise<number> =>
  (await getMySQLRootClient().idempotencyKey.deleteMany({ where: { expiresAt: { lt: now } } })).count;

import { randomUUID } from 'node:crypto';
import { getRedisClient } from '@database/index.js';

const RELEASE_LUA = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

export interface LockHandle {
  token: string;
  release: () => Promise<void>;
}

/**
 * Atomic SET NX PX lock (no GET-then-SET race) with an owner token so only the holder can
 * release it. Fast path only — correctness is still guaranteed by DB unique keys / row locks.
 */
export const acquireLock = async (key: string, ttlMs: number): Promise<LockHandle | null> => {
  const redis = getRedisClient();
  const token = randomUUID();
  const ok = await redis.set(`lock:${key}`, token, 'PX', ttlMs, 'NX');
  if (ok !== 'OK') return null;
  return {
    token,
    release: async () => {
      await redis.eval(RELEASE_LUA, 1, `lock:${key}`, token);
    },
  };
};

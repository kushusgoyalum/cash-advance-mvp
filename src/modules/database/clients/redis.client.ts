import { Redis } from 'ioredis';
import { env } from '@common/config/env.js';

let client: Redis | undefined;

/** Redis is an optimisation (cache, fast-path locks, rate limits) — never the source of truth. */
export const getRedisClient = (): Redis => {
  client ??= new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, enableOfflineQueue: false });
  return client;
};

export const disconnectRedis = async (): Promise<void> => {
  await client?.quit();
  client = undefined;
};

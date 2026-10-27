import { getRedisClient } from '@database/index.js';

/**
 * Cluster-wide fixed-window limiter (per second) so draining a backlog after an outage
 * never exceeds the provider's TPS. Waits for the next window instead of failing.
 */
export const acquireRateToken = async (key: string, perSecond: number): Promise<void> => {
  const redis = getRedisClient();
  for (;;) {
    const second = Math.floor(Date.now() / 1000);
    const bucket = `rl:${key}:${second}`;
    const count = await redis.incr(bucket);
    if (count === 1) await redis.expire(bucket, 2);
    if (count <= perSecond) return;
    await new Promise((r) => setTimeout(r, 1000 - (Date.now() % 1000)));
  }
};

import { getRedisClient } from '@database/index.js';
import { logger } from '../config/logger.js';

/** Independent kill switches (design §4.5) — flipped by SUPERVISOR/ADMIN or on-call. */
export const KillSwitch = {
  NEW_APPLICATIONS: 'NEW_APPLICATIONS',
  DISBURSEMENTS: 'DISBURSEMENTS',
  COLLECTIONS: 'COLLECTIONS',
} as const;
export type KillSwitch = (typeof KillSwitch)[keyof typeof KillSwitch];

const cache = new Map<KillSwitch, { value: boolean; at: number }>();
const TTL_MS = 10_000;

export const isPaused = async (sw: KillSwitch): Promise<boolean> => {
  const hit = cache.get(sw);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  try {
    const value = (await getRedisClient().get(`killswitch:${sw}`)) === '1';
    cache.set(sw, { value, at: Date.now() });
    return value;
  } catch (err) {
    // Fail safe for money movement: if we cannot read the flag, keep the last known value.
    logger.warn({ err, sw }, 'kill switch read failed');
    return hit?.value ?? false;
  }
};

export const setPaused = async (sw: KillSwitch, paused: boolean): Promise<void> => {
  await getRedisClient().set(`killswitch:${sw}`, paused ? '1' : '0');
  cache.delete(sw);
};

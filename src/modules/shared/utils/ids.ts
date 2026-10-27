import { randomBytes } from 'node:crypto';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** ULID: 48-bit time + 80-bit randomness, Crockford base32, 26 chars, sortable, non-enumerable. */
export const newUlid = (now: number = Date.now()): string => {
  let time = '';
  let t = now;
  for (let i = 0; i < 10; i += 1) {
    time = CROCKFORD[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const rand = randomBytes(16);
  let random = '';
  for (let i = 0; i < 16; i += 1) {
    random += CROCKFORD[(rand[i] ?? 0) % 32];
  }
  return time + random;
};

/** Deterministic provider references — the bank idempotency keys (design §4.1). */
export const disbursementRef = (advanceId: bigint, payoutAttempt: number): string => `DSB-${advanceId}-${payoutAttempt}`;
export const collectionRef = (advanceId: bigint, attemptSeq: number): string => `COL-${advanceId}-${attemptSeq}`;

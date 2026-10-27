import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const sha256Hex = (input: string): string => createHash('sha256').update(input).digest('hex');

export const hmacSha256Hex = (secret: string, input: string): string =>
  createHmac('sha256', secret).update(input).digest('hex');

export const safeEqual = (a: string, b: string): boolean => {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
};

/** Deterministic JSON (sorted keys, bigint as string) — used for request hashes and audit hashes. */
export const canonicalJson = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) => {
    if (typeof v === 'bigint') return v.toString();
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
    }
    return v;
  });

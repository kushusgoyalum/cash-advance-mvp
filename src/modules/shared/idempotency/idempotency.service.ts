import { HttpStatus } from '../constants/httpStatus.js';
import { AppError, ErrorCodes } from '../errors/index.js';
import { canonicalJson, sha256Hex } from '../utils/hash.js';
import * as repo from './idempotency.repo.js';

const TTL_MS = 24 * 60 * 60 * 1000;
const KEY_PATTERN = /^[A-Za-z0-9-]{16,64}$/;

export interface IdempotentResult<T> {
  statusCode: number;
  body: T;
  replayed: boolean;
}

/**
 * API-level idempotency (design §4.1, layer 1):
 *  - same key + same body  → replay the stored response (no second side effect)
 *  - same key + other body → 422 IDEMPOTENCY_KEY_MISMATCH
 *  - same key still running → 409 REQUEST_IN_PROGRESS
 *  - handler throws → the claim is released so the client may retry with the same key
 */
export const withIdempotency = async <T>(
  ctx: { userId: string; key: string | undefined; endpoint: string; body: unknown },
  handler: () => Promise<{ statusCode: number; body: T }>,
): Promise<IdempotentResult<T>> => {
  if (!ctx.key || !KEY_PATTERN.test(ctx.key)) throw new AppError(ErrorCodes.IDEMPOTENCY_KEY_MISSING, HttpStatus.BAD_REQUEST);
  const requestHash = sha256Hex(canonicalJson({ endpoint: ctx.endpoint, body: ctx.body ?? null }));

  const claimed = await repo.tryClaimKey({
    userId: ctx.userId,
    key: ctx.key,
    endpoint: ctx.endpoint,
    requestHash,
    expiresAt: new Date(Date.now() + TTL_MS),
  });

  if (!claimed) {
    const existing = await repo.findKey(ctx.userId, ctx.key);
    if (!existing) throw new AppError(ErrorCodes.REQUEST_IN_PROGRESS, HttpStatus.CONFLICT);
    if (existing.requestHash !== requestHash) throw new AppError(ErrorCodes.IDEMPOTENCY_KEY_MISMATCH, HttpStatus.UNPROCESSABLE_ENTITY);
    if (existing.status === 'IN_PROGRESS') throw new AppError(ErrorCodes.REQUEST_IN_PROGRESS, HttpStatus.CONFLICT);
    return { statusCode: existing.responseCode ?? HttpStatus.OK, body: existing.responseBody as T, replayed: true };
  }

  try {
    const result = await handler();
    await repo.completeKey(ctx.userId, ctx.key, result.statusCode, result.body);
    return { ...result, replayed: false };
  } catch (err) {
    await repo.releaseKey(ctx.userId, ctx.key);
    throw err;
  }
};

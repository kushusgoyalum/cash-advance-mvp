import { HttpStatus } from '../constants/httpStatus.js';
import { AppError, ErrorCodes } from '../errors/index.js';
import { hmacSha256Hex, safeEqual } from '../utils/hash.js';

const REPLAY_WINDOW_SECONDS = 5 * 60;

/**
 * Verifies HMAC-SHA256(secret, `${timestamp}.${rawBody}`) and rejects stale timestamps
 * (replay protection). Must run on the RAW body, before JSON parsing changes it.
 */
export const verifyWebhookSignature = (args: {
  secret: string;
  rawBody: string | undefined;
  signature: string | undefined;
  timestamp: string | undefined;
  nowSeconds?: number;
}): void => {
  const now = args.nowSeconds ?? Math.floor(Date.now() / 1000);
  const ts = Number(args.timestamp);
  const fail = (): never => {
    throw new AppError(ErrorCodes.WEBHOOK_SIGNATURE_INVALID, HttpStatus.UNAUTHORIZED);
  };
  if (!args.rawBody || !args.signature || !Number.isFinite(ts)) fail();
  if (Math.abs(now - ts) > REPLAY_WINDOW_SECONDS) fail();
  const expected = hmacSha256Hex(args.secret, `${ts}.${args.rawBody}`);
  if (!safeEqual(expected, args.signature ?? '')) fail();
};

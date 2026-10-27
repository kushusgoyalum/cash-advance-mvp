import pino from 'pino';
import { env } from './env.js';
import { PII_REDACT_PATHS } from '../utils/piiMasker.js';

/** Structured logger. PII paths are redacted so raw PAN/account/mobile never reach logs. */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: { paths: PII_REDACT_PATHS, censor: '[REDACTED]' },
  base: { service: 'cash-advance-service' },
});

export const createChildLogger = (bindings: Record<string, unknown>): pino.Logger => logger.child(bindings);

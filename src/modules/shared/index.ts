/**
 * Shared Module - Public API (cross-cutting kernel). Other modules import from '@common/index.js'.
 */
export { env, isProduction, type Env } from './config/env.js';
export { logger, createChildLogger } from './config/logger.js';
export { HttpStatus } from './constants/httpStatus.js';
export { BUSINESS } from './constants/business.js';
export { AppError, ErrorCodes, ErrorMessages, type ErrorCode, type ErrorDetails } from './errors/index.js';

export { sendSuccess, type ApiEnvelope } from './utils/response.js';
export { newUlid, disbursementRef, collectionRef } from './utils/ids.js';
export { sha256Hex, hmacSha256Hex, safeEqual, canonicalJson } from './utils/hash.js';
export { minPaise, maxPaise, paiseToNumber, flatFeeAprBps } from './utils/money.js';
export {
  istBusinessDate,
  istInstant,
  addDays,
  daysBetween,
  nextBusinessDay,
  toDateOnly,
  fromDateOnly,
  hoursFromNow,
  secondsFromNow,
} from './utils/dates.js';
export { signHs256Jwt, verifyHs256Jwt, type JwtClaims } from './utils/jwt.js';
export { maskMobile, maskAccountNumber } from './utils/piiMasker.js';

export { userJwtAuth, requireUser } from './middleware/userJwtAuth.js';
export { opsAuth, requireOpsRole, requireOps } from './middleware/opsAuth.js';
export { internalAuth } from './middleware/internalAuth.js';
export { verifyWebhookSignature } from './middleware/webhookSignature.js';
export { errorHandler } from './middleware/errorHandler.js';
export { roleAtLeast, type OpsPrincipal, type OpsRole, type UserPrincipal } from './middleware/principals.js';

export { withIdempotency, type IdempotentResult } from './idempotency/idempotency.service.js';
export { deleteExpiredKeys } from './idempotency/idempotency.repo.js';
export { emitEvent, type EmitEventInput } from './outbox/outbox.js';
export { DomainEvents, type DomainEventType, type DomainEventMessage } from './events/domainEvents.js';
export { QueueName, queueUrl } from './queue/queues.js';
export { publishMessage, startConsumer, type ConsumerOptions } from './queue/sqs.js';
export { processOnce } from './queue/idempotentConsumer.js';

export { ProviderError, backoffWithJitterMs, payoutRetryDelayMs, withRetry, type ProviderErrorKind } from './resilience/retry.js';
export { CircuitBreaker, getBreaker, type BreakerState } from './resilience/circuitBreaker.js';
export { acquireRateToken } from './resilience/rateLimiter.js';
export { acquireLock, type LockHandle } from './locks/distributedLock.js';
export { KillSwitch, isPaused, setPaused } from './featureFlags/killSwitch.js';

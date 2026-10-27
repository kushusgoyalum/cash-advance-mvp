# Shared Module (kernel)

Cross-cutting building blocks. Import everything from `@common/index.js`.

| Area | Files | Purpose |
|---|---|---|
| Config | `config/env.ts`, `config/logger.ts` | Env validated with Zod at boot. Pino logger with PII redaction. |
| Errors / response | `errors/*`, `utils/response.ts`, `middleware/errorHandler.ts` | `AppError` with error codes, the `{ success, data, error }` envelope. |
| Auth | `middleware/userJwtAuth.ts`, `opsAuth.ts`, `internalAuth.ts`, `webhookSignature.ts`, `utils/jwt.ts` | User HS256 JWT, ops token plus RBAC, service token, webhook HMAC with a replay window. |
| Idempotency | `idempotency/*` | `withIdempotency()`: replay, mismatch (422), in-progress (409). |
| Outbox / events | `outbox/outbox.ts`, `events/domainEvents.ts` | `emitEvent()` writes to `outbox_event` in the current transaction. |
| Queues | `queue/*` | SQS publish and long-poll consumer (visibility backoff, DLQ), `processOnce()`. |
| Resilience | `resilience/*` | `ProviderError` classification, backoff with jitter, circuit breaker, Redis rate limiter. |
| Locks / flags | `locks/distributedLock.ts`, `featureFlags/killSwitch.ts` | Atomic `SET NX PX` lock with owner token. Kill switches. |
| Utils | `utils/*` | ULIDs and deterministic provider refs, paise math, IST business dates, hashing, PII masking. |

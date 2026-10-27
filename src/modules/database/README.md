# Database Module

- `getMySQLClient()` is **transaction-aware**. Inside `runTransactional()` it returns the transaction client (via AsyncLocalStorage), so repo calls made by a service join the same transaction without passing `tx` around.
- `runTransactional(fn)` starts an interactive MySQL transaction (READ COMMITTED). Nested calls join the outer one.
- `isUniqueConstraintError(err)` detects P2002. Unique keys are the final guard for idempotency.
- `getMongoDBClient()` holds BRE traces, bureau reports, provider API logs, the webhook inbox and recon reports.
- `getRedisClient()` handles caching, fast-path locks and rate limits. It is **never** the source of truth.

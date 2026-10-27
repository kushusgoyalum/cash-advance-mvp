# Cash Advance Service: pseudo-code repo

A compilable TypeScript skeleton of the design in `../Cash_Advance_Service_Design.docx`. It is a **modular monolith** on **Fastify + TypeScript + Prisma (MySQL + MongoDB) + Redis + SQS**, with the module layout, `Autowired` route registration and controller → service → repo layering of a standard modular-monolith codebase.

The critical paths have real logic: state machine, idempotency, disbursement, collection, outbox, audit chain, rule engine. Providers are ports with HTTP and mock adapters. `pnpm type-check` and `pnpm test` both pass.

## Quick start

```bash
pnpm install                 # also generates both Prisma clients
cp .env.example .env
docker compose up -d         # mysql, mongo (replica set), redis, localstack (SQS)
pnpm prisma db push --schema prisma/mysql.prisma && mysql ... < prisma/sql/001_generated_columns.sql
pnpm dev                     # API process
pnpm dev:worker              # worker process (consumers + outbox relay + scheduler)
pnpm check                   # type-check + unit tests
pnpm smoke                   # boot the app in-process: routes + auth/signature guards
```

## Layout

```text
src/
  server.ts / worker.ts        # two process types from ONE codebase (design §2.1)
  app.ts                       # Fastify, Zod compilers, raw-body parser (webhook HMAC), error handler
  routes/                      # Autowired registry, routes.enum.ts (module + prefix), registerRoutes
  modules/
    shared/       kernel: env, errors, auth (JWT/RBAC/HMAC), idempotency, outbox, SQS, retry, circuit breaker, locks, kill switches
    database/     transaction-aware Prisma clients (MySQL, Mongo), Redis
    thirdParty/   ports + adapters: Banking (escrow probe), Bureau, Karix messaging, Push, Platform
    eligibility/  BRE rule engine + versioned rule sets, snapshots, product config     GET /v1/cash-advance/eligibility
    application/  cash_advance aggregate, STATE MACHINE, pricing/KFS, decision worker  /v1/cash-advance/applications...
    review/       admin portal API (RBAC, maker limits, audit history, kill switches)  /admin/v1/cash-advance/...
    disbursement/ payout orchestration (status-query-first, retry window, ops retry)
    collection/   collection calendar, full/partial/none, overdue, credit-triggered retry, reminders
    ledger/       append-only double entry per advance + invariants
    notification/ event → channels, Karix templates, dedupe, retry, fallback
    audit/        immutable per-entity hash chain
    webhooks/     HMAC-verified bank webhooks → Mongo inbox → queue      POST /webhooks/v1/banking
    jobs/         outbox relay, SQS consumers, scheduler, reconciliation  POST /internal/v1/cash-advance/jobs/:job/run
    health/       /health/live, /health/ready
prisma/
  mysql.prisma, mongodb.prisma, sql/001_generated_columns.sql (one-active-advance key), sql/002_grants.sql (append-only)
```

## Design document → code

| Design section | Where |
|---|---|
| §3.1 Database | `prisma/mysql.prisma`, `prisma/mongodb.prisma`, `prisma/sql/*` |
| §3.2 APIs | `*/controllers/*.controller.ts` + `controllers/schemas` (Zod) |
| §3.3 State machine | `application/stateMachine.ts` (`ALLOWED_TRANSITIONS`, `transitionAdvance`) |
| §4.1 Idempotency (5 layers) | `shared/idempotency`, DB unique keys, state guard, `disbursementRef`/`collectionRef`, `processOnce` + webhook inbox |
| §4.2 Retry | `shared/resilience/retry.ts`, `disbursement.service.ts`, `queue/sqs.ts` (visibility backoff → DLQ) |
| §4.3 Provider outages | `shared/resilience/circuitBreaker.ts`, `thirdParty/banking/banking.registry.ts` (`probeBankHealth`), `SKIPPED_OUTAGE` in collection |
| §4.5 Recovery | `disbursement.sweepPayouts`, `collection.sweepStuckAttempts`, `webhooks.sweepWebhookInbox`, `jobs/reconciliation.ts`, kill switches |
| §5 Security | `shared/middleware/*`, `shared/utils/jwt.ts`, `piiMasker.ts`, `audit/*`, `sql/002_grants.sql` |
| §6.3 Background jobs | `jobs/scheduler.ts` (interval + daily with `job_run` guard), `jobs/consumers.ts`, `jobs/outboxRelay.ts` |

## End-to-end flow

1. `GET /eligibility` runs the soft BRE (no bureau pull), saves a snapshot and caches it for 15 minutes.
2. `POST /applications` creates a DRAFT with a locked quote and KFS. `POST /applications/:id/submit` takes consents and a step-up token, re-checks the gates, and writes SUBMITTED plus an outbox event in one transaction.
3. The outbox relay publishes to the decision queue. `decideApplication` runs the bureau pull and rules, giving APPROVED, UNDER_REVIEW (review task with 24h SLA) or REJECTED.
4. APPROVED goes to the disbursement queue. `startDisbursement` creates a payout row (`DSB-{id}-1`) and moves to DISBURSEMENT_PENDING. `executePayout` either completes (DISBURSED, due date fixed, ledger posted) or retries / queries status.
5. Collection: plan at 06:30, then dispatch, then execute (`COL-{id}-{seq}`, full, partial or none, fee first). Overdue marking at 23:55. A credit webhook triggers an early retry.
6. Every transition writes history, an audit hash-chain record and an outbox event, which then becomes notifications (Karix and push).

## Tests

`pnpm test`: state-machine table and guarded update, idempotency (replay, mismatch, in-progress, release), circuit breaker and retry, webhook HMAC and JWT, collection calendar and allocation, collection worker (full, partial, none, redelivery, outage), payout worker (timeout → UNKNOWN, status query before resend, same clientRef, confirmed failure), BRE rules and limits, audit tamper detection.

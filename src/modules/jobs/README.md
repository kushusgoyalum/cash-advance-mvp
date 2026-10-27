# Jobs Module

Everything the **worker process** runs, plus the internal trigger route.

- **Outbox relay** (`outboxRelay.ts`): moves PENDING `outbox_event` rows to SQS (`EVENT_ROUTES` fan-out), then marks them PUBLISHED. Only one relay is active at a time (Redis lock). Delivery is at-least-once.
- **Consumers** (`consumers.ts`): one per queue, routing to decision, disbursement, collection, notification and webhook handlers. All are idempotent.
- **Scheduler** (`scheduler.ts`):
  - Interval jobs: bank health probe (60s, also caches the escrow balance), collection dispatch, payout, collection and webhook-inbox sweepers, notification retry, draft and review-SLA expiry.
  - Daily jobs (IST): reconciliation 06:00 (for yesterday), collection plan 06:30, reminders 09:00, overdue marking 23:55, idempotency purge 03:00.
- Daily jobs are guarded by `job_run(job, business_date)`, so a double trigger (cron plus a manual call) is harmless. In production EventBridge calls `POST /internal/v1/cash-advance/jobs/:job/run`.
- **Reconciliation** (`reconciliation.ts`): compares the bank statement with our payouts and collections by clientRef, into three buckets (matched, provider-only, ours-only), and checks the ledger invariants.

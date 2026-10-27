# Disbursement Module

Moves an APPROVED advance to DISBURSED through the banking provider **without ever paying twice**.

1. `startDisbursement` consumes `APPLICATION_APPROVED`. In one transaction it inserts `disbursement` (UNIQUE `advance_id`, `client_ref = DSB-{id}-1`) and moves APPROVED → DISBURSEMENT_PENDING. Kill switch or low escrow balance → the advance stays APPROVED and the sweeper resumes it later.
2. `executePayout` sends the payout with `client_ref` as the bank idempotency key. If a previous call may have reached the bank (timeout, 5xx), it **queries status first**: SUCCESS → complete, FAILED → fail, NOT_FOUND → send.
3. Retries use 30s → 1m → 2m → 5m → 15m → 30m → 1h with jitter, inside a 24h window. An **UNKNOWN outcome is never marked FAILED**; it pages ops instead.
4. `completeDisbursement` fixes `due_date = disbursal date + tenure` (next business day), posts the ledger entries and moves the advance to DISBURSED, all in one transaction.
5. `retryFailedPayout` (SUPERVISOR) re-checks the old reference with the bank and only then uses `DSB-{id}-{n+1}`.
6. `sweepPayouts` runs every 5 minutes and handles stuck or in-flight payouts, plus APPROVED advances that never started.

A Redis `SET NX` lock per payout prevents two workers working on the same payout. Correctness still rests on the DB state and the client ref.

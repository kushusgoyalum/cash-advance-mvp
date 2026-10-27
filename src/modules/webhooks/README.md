# Webhooks Module

The only entry point for unauthenticated provider traffic.

1. `POST /webhooks/v1/banking` verifies `x-signature = HMAC-SHA256(secret, "${x-timestamp}.${rawBody}")` and rejects requests more than 5 minutes old.
2. The event is persisted to the Mongo `webhook_inbox`. UNIQUE `providerEventId` turns duplicates into a `200 {duplicate:true}`.
3. The handler acknowledges fast with `200`. Processing happens on the `webhook` queue (`processInboxEvent`), which dispatches to disbursement (`PAYOUT_STATUS`) or collection (`DEBIT_STATUS`, `CREDIT_RECEIVED`). All target handlers are idempotent.
4. `sweepWebhookInbox` re-enqueues rows that were persisted but never processed.

# Application Module

Owns the `cash_advance` aggregate and the **state machine** for the whole lifecycle.

| Route (user JWT) | Behaviour |
|---|---|
| `POST /v1/cash-advance/applications` | Idempotent. Creates a DRAFT with a locked quote (fee, total, APR, indicative due date) and a KFS link. |
| `POST /v1/cash-advance/applications/:id/submit` | Idempotent. Takes consents and a step-up token, re-checks hard gates, DRAFT → SUBMITTED, returns `202`. |
| `GET /v1/cash-advance/applications/:id` | Returns the user's own advance. Ownership is part of the query. |
| `GET /v1/cash-advance/applications` | Cursor pagination. |
| `POST /v1/cash-advance/applications/:id/cancel` | Allowed only until the payout starts. |

**State machine** (`stateMachine.ts`): `ALLOWED_TRANSITIONS` is the single source of truth. `transitionAdvance()` runs a conditional `UPDATE ... WHERE status=:from [AND version=:v]` and writes status history, audit and the outbox event in the **same transaction**.

**Decision worker** (`decideApplication`) consumes `APPLICATION_SUBMITTED` and moves the advance to APPROVED, UNDER_REVIEW or REJECTED. If the bureau is unavailable for 2h the application is referred to manual review.

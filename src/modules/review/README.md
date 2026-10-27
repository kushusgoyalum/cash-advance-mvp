# Review (Admin) Module

The admin portal API, protected by an ops token (SSO + MFA) plus a role check on every route.

| Route | Role | Notes |
|---|---|---|
| `GET /admin/v1/cash-advance/applications` | VIEWER | Search by status, user, public ID, date range. Cursor pagination. |
| `GET /admin/v1/cash-advance/applications/:id` | VIEWER | Decision trace, review task, payout, collections, ledger, timeline. PII masked. |
| `POST .../applications/:id/approve` | REVIEWER | `expectedVersion`, within the reviewer's approval limit, only from UNDER_REVIEW. Idempotent. |
| `POST .../applications/:id/reject` | REVIEWER | `expectedVersion`, `reasonCode` and note required. |
| `POST .../applications/:id/disbursement/retry` | SUPERVISOR | Re-confirms with the bank before using a new client ref. |
| `GET .../applications/:id/audit` | VIEWER | Audit records plus `chainIntact`. |
| `GET /admin/v1/cash-advance/repayments` | VIEWER | Repayment attempts by due date and status. |
| `POST /admin/v1/cash-advance/kill-switches` | ADMIN | Pause or resume new applications, disbursals or collections (audited). |

`onApplicationReferred` (event consumer) creates a review task with a 24h SLA. `expireReviewSla` (job) expires breached ones.

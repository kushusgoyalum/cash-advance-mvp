# Ledger Module

Append-only double-entry ledger per advance. Each money movement writes a balanced DR/CR pair sharing one `reference` (the provider client ref, e.g. `DSB-12-1`, `COL-12-3:FEE`).

| Event | DR | CR |
|---|---|---|
| Disbursal (principal) | ADVANCE_RECEIVABLE | ESCROW_BANK |
| Fee accrual | FEE_RECEIVABLE | FEE_INCOME |
| Repayment, fee part | COLLECTION_BANK | FEE_RECEIVABLE |
| Repayment, principal part | COLLECTION_BANK | ADVANCE_RECEIVABLE |

`UNIQUE(reference, account, direction)` with `skipDuplicates` makes posting idempotent. Reconciliation calls `checkInvariants()`.

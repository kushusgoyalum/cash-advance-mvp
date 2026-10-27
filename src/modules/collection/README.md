# Collection Module

Automatic repayment from the user's account on and after the due date.

| Step | When | What |
|---|---|---|
| `planCollectionsForDate` | 06:30 IST daily | Inserts today's slots for each repayable advance. UNIQUE(advance_id, attempt_seq) makes it idempotent. |
| `dispatchDueAttempts` | every 5 min | Claims PLANNED → IN_PROGRESS with a conditional update, then enqueues to the `collection` SQS queue. |
| `executeAttempt` | worker | Queries debit status for the clientRef first, then checks balance and debits min(balance, outstanding). |
| `applyDebitSuccess` | worker / webhook | Row lock, fee-first allocation, ledger, then REPAID, PARTIALLY_REPAID or amounts-only update. |
| `markOverdue` | 23:55 IST | DISBURSED or PARTIALLY_REPAID with outstanding → OVERDUE, **unless every attempt was skipped because the bank was down**. |
| `onCreditReceived` | bank webhook | One early attempt per day when money lands in the account. |
| `sweepStuckAttempts` | every 5 min | IN_PROGRESS > 15 min → status query (SUCCESS, FAILED, or NOT_FOUND → re-plan). |
| `emitRepaymentReminders` | 09:00 IST | Due T-3, T-1, T. Overdue D+1, D+3, D+7, then weekly. Sent via the outbox to the notification module. |

The calendar is D at 07:00, 13:00 and 19:00, then daily until D+7, then every 3 days until D+30 (`collection.utils.ts`).

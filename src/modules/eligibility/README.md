# Eligibility Module (BRE)

Answers "can this user take an advance, and how much?".

- **Soft evaluation** (`GET /v1/cash-advance/eligibility`): hard gates plus the inflow tier, with **no bureau pull**. The result is persisted as `eligibility_snapshot` and cached in Redis for 15 minutes.
- **Decision evaluation** (`evaluateForDecision`, run by the decision worker after consent): hard gates plus bureau hard-pull rules plus an amount-limit check. Returns APPROVE, REFER or REJECT. The full trace is saved to Mongo (`bre_evaluations`).
- **Rule sets are data** (`bre/ruleSets.ts`, versioned). The engine (`bre/ruleEngine.ts`) supports `GATE` and `TIER_TABLE` rules with REJECT > REFER > PASS precedence.
- **New users** (< 30 days) get reason `ACCOUNT_AGE_LT_30D` plus an `eligibleFrom` date for the in-app countdown.
- **Max amount** = min(tier cap, 30% of average monthly inflow, product max), rounded down to ₹100. First-time borrowers are capped at STARTER and move up after on-time repayments.
- Reads `cash_advance` **read-only** (flags) and never writes it.

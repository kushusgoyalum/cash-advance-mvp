# Audit Module

Immutable audit trail of status changes, manual actions, approval decisions and money events.

- `recordAudit()` is called **inside the same DB transaction** as the change (via the state machine and money flows).
- Each entity has its own hash chain: `hash = SHA-256(prevHash | canonical(record))`. A per-entity chain avoids a global write bottleneck.
- The app's DB role has INSERT/SELECT only on `audit_log` (`prisma/sql/002_grants.sql`). A nightly job verifies the chains and exports to S3 Object Lock (WORM).
- `getAuditTrail()` returns the records plus `chainIntact` for the admin portal.

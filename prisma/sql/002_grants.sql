-- Least privilege for the application role. Audit, history and ledger are append-only:
-- the app can INSERT and SELECT but never UPDATE or DELETE them. Migrations run as a
-- separate role.
GRANT SELECT, INSERT, UPDATE, DELETE ON cash_advance_db.* TO 'cash_advance_app'@'%';
REVOKE UPDATE, DELETE ON cash_advance_db.audit_log      FROM 'cash_advance_app'@'%';
REVOKE UPDATE, DELETE ON cash_advance_db.status_history FROM 'cash_advance_app'@'%';
REVOKE UPDATE, DELETE ON cash_advance_db.ledger_entry   FROM 'cash_advance_app'@'%';

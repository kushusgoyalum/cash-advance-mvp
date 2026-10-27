-- Run after `prisma migrate` / `db push`. Prisma cannot model generated columns, so the
-- "one active advance per user" invariant is enforced here by the database itself.
ALTER TABLE cash_advance DROP INDEX uq_one_active_advance_per_user;
ALTER TABLE cash_advance DROP COLUMN active_user_id;
ALTER TABLE cash_advance
  ADD COLUMN active_user_id BIGINT GENERATED ALWAYS AS (
    CASE WHEN status IN ('REPAID','REJECTED','CANCELLED','EXPIRED') THEN NULL ELSE user_id END
  ) STORED,
  ADD UNIQUE INDEX uq_one_active_advance_per_user (active_user_id);

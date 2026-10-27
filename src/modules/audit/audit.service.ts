import * as repo from './audit.repo.js';
import type { AuditEntryInput } from './audit.types.js';
import { computeAuditHash, findBrokenLink } from './audit.utils.js';

const recordOf = (e: {
  entityType: string; entityId: string; action: string; actorType: string; actorId: string;
  before: unknown; after: unknown; reason: string | null; requestId: string | null;
}): Record<string, unknown> => ({
  entityType: e.entityType,
  entityId: e.entityId,
  action: e.action,
  actorType: e.actorType,
  actorId: e.actorId,
  before: e.before ?? null,
  after: e.after ?? null,
  reason: e.reason,
  requestId: e.requestId,
});

/**
 * Appends an audit record IN THE CALLER'S TRANSACTION (so it commits/rolls back with the
 * change it describes). Chain is per entity: for cash_advance the conditional UPDATE already
 * holds the row lock, which serialises appends for that entity without a global lock.
 */
export const recordAudit = async (input: AuditEntryInput): Promise<void> => {
  const prevHash = await repo.findLastHash(input.entityType, input.entityId);
  const base = {
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    actorType: input.actor.type,
    actorId: input.actor.id,
    before: input.before ?? null,
    after: input.after ?? null,
    reason: input.reason ?? null,
    requestId: input.requestId ?? null,
  };
  const hash = computeAuditHash(prevHash, recordOf(base));
  const { before, after, ...rest } = base;
  await repo.insertAudit({
    ...rest,
    ...(before ? { before: before as object } : {}),
    ...(after ? { after: after as object } : {}),
    ip: input.ip ?? null,
    prevHash,
    hash,
  });
};

/** Admin "view audit history": records + chain verification result. */
export const getAuditTrail = async (entityType: string, entityId: string) => {
  const rows = await repo.listForEntity(entityType, entityId);
  const broken = findBrokenLink(rows.map((r) => ({ prevHash: r.prevHash, hash: r.hash, record: recordOf(r) })));
  return { records: rows, chainIntact: broken === -1, firstBrokenIndex: broken === -1 ? null : broken };
};

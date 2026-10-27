/** Audit Module - Public API (no routes; admin reads it through the review module). */
export { recordAudit, getAuditTrail } from './audit.service.js';
export { computeAuditHash, findBrokenLink } from './audit.utils.js';
export type { Actor, AuditEntryInput } from './audit.types.js';

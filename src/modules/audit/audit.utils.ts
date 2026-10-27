import { canonicalJson, sha256Hex } from '@common/index.js';

/** Hash of one audit record, chained to the previous record of the same entity. */
export const computeAuditHash = (prevHash: string | null, record: Record<string, unknown>): string =>
  sha256Hex(`${prevHash ?? 'GENESIS'}|${canonicalJson(record)}`);

export interface ChainRow {
  prevHash: string | null;
  hash: string;
  record: Record<string, unknown>;
}

/** Recomputes the chain; returns the index of the first broken link or -1 when intact. */
export const findBrokenLink = (rows: readonly ChainRow[]): number => {
  let prev: string | null = null;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;
    if (row.prevHash !== prev || computeAuditHash(prev, row.record) !== row.hash) return i;
    prev = row.hash;
  }
  return -1;
};

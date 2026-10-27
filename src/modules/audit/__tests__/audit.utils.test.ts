import { describe, expect, it } from 'vitest';
import { computeAuditHash, findBrokenLink } from '../audit.utils.js';

const build = (records: Array<Record<string, unknown>>) => {
  let prev: string | null = null;
  return records.map((record) => {
    const hash = computeAuditHash(prev, record);
    const row = { prevHash: prev, hash, record };
    prev = hash;
    return row;
  });
};

describe('audit hash chain', () => {
  const chain = build([{ action: 'CREATED' }, { action: 'STATUS_SUBMITTED' }, { action: 'STATUS_APPROVED' }]);

  it('an untouched chain verifies', () => {
    expect(findBrokenLink(chain)).toBe(-1);
  });

  it('editing any past record is detected at that record', () => {
    const tampered = chain.map((r, i) => (i === 1 ? { ...r, record: { action: 'STATUS_REJECTED' } } : r));
    expect(findBrokenLink(tampered)).toBe(1);
  });

  it('deleting a record breaks the next link', () => {
    expect(findBrokenLink([chain[0]!, chain[2]!])).toBe(1);
  });
});

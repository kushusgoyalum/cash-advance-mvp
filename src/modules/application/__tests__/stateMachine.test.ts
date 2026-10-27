import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@database/index.js', () => ({ runTransactional: (fn: () => Promise<unknown>) => fn() }));
vi.mock('@modules/audit/index.js', () => ({ recordAudit: vi.fn() }));
vi.mock('@common/index.js', async (orig) => ({ ...(await orig<object>()), emitEvent: vi.fn() }));
vi.mock('../application.repo.js', () => ({
  conditionalUpdate: vi.fn(),
  findById: vi.fn(),
  findByIdOrThrow: vi.fn(),
  insertHistory: vi.fn(),
}));

const repo = await import('../application.repo.js');
const { recordAudit } = await import('@modules/audit/index.js');
const { emitEvent, AppError } = await import('@common/index.js');
const { ALLOWED_TRANSITIONS, TERMINAL_STATUSES, assertTransition, canTransition, transitionAdvance } = await import('../stateMachine.js');

const SYSTEM = { type: 'SYSTEM' as const, id: 'test' };

describe('state machine — transition table', () => {
  it.each([
    ['DRAFT', 'SUBMITTED'],
    ['SUBMITTED', 'APPROVED'],
    ['SUBMITTED', 'UNDER_REVIEW'],
    ['UNDER_REVIEW', 'REJECTED'],
    ['APPROVED', 'DISBURSEMENT_PENDING'],
    ['DISBURSEMENT_PENDING', 'DISBURSED'],
    ['DISBURSEMENT_FAILED', 'DISBURSEMENT_PENDING'],
    ['DISBURSED', 'PARTIALLY_REPAID'],
    ['PARTIALLY_REPAID', 'OVERDUE'],
    ['OVERDUE', 'REPAID'],
  ] as const)('allows %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each([
    ['APPROVED', 'DISBURSED', 'money must go through a payout record'],
    ['SUBMITTED', 'DISBURSED', 'skips approval and payout'],
    ['DISBURSEMENT_PENDING', 'CANCELLED', 'money may already be out'],
    ['DISBURSED', 'REJECTED', 'cannot reject after disbursal'],
    ['REJECTED', 'APPROVED', 'user must re-apply'],
    ['DRAFT', 'APPROVED', 'skips consents'],
    ['OVERDUE', 'PARTIALLY_REPAID', 'overdue is sticky until repaid'],
    ['OVERDUE', 'DISBURSED', 'no going back'],
  ] as const)('rejects %s → %s (%s)', (from, to, _why) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => assertTransition(from, to)).toThrowError(AppError);
  });

  it('terminal states have no outgoing transitions', () => {
    for (const s of TERMINAL_STATUSES) expect(ALLOWED_TRANSITIONS[s]).toEqual([]);
  });
});

describe('transitionAdvance — guarded update', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes status + history + audit + outbox event together', async () => {
    vi.mocked(repo.conditionalUpdate).mockResolvedValue(1);
    vi.mocked(repo.findByIdOrThrow).mockResolvedValue({ id: 1n, userId: 7n, status: 'SUBMITTED', version: 2 } as never);

    await transitionAdvance({ advanceId: 1n, from: 'DRAFT', to: 'SUBMITTED', actor: SYSTEM, event: { type: 'APPLICATION_SUBMITTED' } });

    expect(repo.conditionalUpdate).toHaveBeenCalledWith(1n, 'DRAFT', undefined, expect.objectContaining({ status: 'SUBMITTED' }));
    expect(repo.insertHistory).toHaveBeenCalledOnce();
    expect(recordAudit).toHaveBeenCalledOnce();
    expect(emitEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'APPLICATION_SUBMITTED', aggregateId: '1' }));
  });

  it('maps a lost race to INVALID_STATE_TRANSITION (409)', async () => {
    vi.mocked(repo.conditionalUpdate).mockResolvedValue(0);
    vi.mocked(repo.findById).mockResolvedValue({ id: 1n, status: 'CANCELLED', version: 3 } as never);

    await expect(
      transitionAdvance({ advanceId: 1n, from: 'APPROVED', to: 'DISBURSEMENT_PENDING', actor: SYSTEM }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION', statusCode: 409 });
    expect(repo.insertHistory).not.toHaveBeenCalled();
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('maps a stale admin version to VERSION_CONFLICT (409)', async () => {
    vi.mocked(repo.conditionalUpdate).mockResolvedValue(0);
    vi.mocked(repo.findById).mockResolvedValue({ id: 1n, status: 'UNDER_REVIEW', version: 5 } as never);

    await expect(
      transitionAdvance({ advanceId: 1n, from: 'UNDER_REVIEW', to: 'APPROVED', actor: SYSTEM, expectedVersion: 4 }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  });
});

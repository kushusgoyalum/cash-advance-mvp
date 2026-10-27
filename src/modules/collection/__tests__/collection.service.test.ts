import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@database/index.js', () => ({ runTransactional: (fn: () => Promise<unknown>) => fn() }));
vi.mock('@common/index.js', async (orig) => ({ ...(await orig<object>()), acquireRateToken: vi.fn(), emitEvent: vi.fn() }));
vi.mock('@modules/application/index.js', () => ({
  getAdvanceById: vi.fn(),
  lockAdvanceForUpdate: vi.fn(),
  transitionAdvance: vi.fn(),
  updateAdvanceInStatus: vi.fn(),
}));
vi.mock('@modules/ledger/index.js', () => ({ postRepayment: vi.fn() }));
const bank = { getDebitStatus: vi.fn(), getAccountBalance: vi.fn(), debitAccount: vi.fn() };
vi.mock('@modules/thirdParty/index.js', () => ({
  getBankingProvider: () => bank,
  getPlatformClient: () => ({ getUserProfile: vi.fn().mockResolvedValue({ accountRef: 'ACC-7' }) }),
  isBankAvailable: vi.fn(() => true),
}));
vi.mock('../collection.repo.js', () => ({ findAttempt: vi.fn(), updateAttempt: vi.fn() }));

const app = await import('@modules/application/index.js');
const { postRepayment } = await import('@modules/ledger/index.js');
const thirdParty = await import('@modules/thirdParty/index.js');
const repo = await import('../collection.repo.js');
const { executeAttempt } = await import('../collection.service.js');

const advance = {
  id: 1n, userId: 7n, publicId: 'P', status: 'DISBURSED',
  principalPaise: 3_000_00n, feePaise: 199_00n, totalRepayablePaise: 3_199_00n,
  collectedPaise: 0n, feeCollectedPaise: 0n, consents: { consentRef: 'CNS-P' },
};
const attempt = { id: 10n, advanceId: 1n, clientRef: 'COL-1-1', status: 'IN_PROGRESS', requestedPaise: 0n };

describe('executeAttempt — due-date collection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(thirdParty.isBankAvailable).mockReturnValue(true);
    vi.mocked(repo.findAttempt).mockResolvedValue({ ...attempt } as never);
    vi.mocked(app.getAdvanceById).mockResolvedValue({ ...advance } as never);
    bank.getDebitStatus.mockResolvedValue({ status: 'NOT_FOUND' });
  });

  it('full balance → debits the full outstanding with the deterministic clientRef and marks REPAID', async () => {
    bank.getAccountBalance.mockResolvedValue(5_000_00n);
    bank.debitAccount.mockResolvedValue({ status: 'SUCCESS', debitedPaise: 3_199_00n });

    await executeAttempt(10n);

    expect(bank.debitAccount).toHaveBeenCalledWith(expect.objectContaining({ clientRef: 'COL-1-1', amountPaise: 3_199_00n }));
    expect(postRepayment).toHaveBeenCalledWith({ advanceId: 1n, reference: 'COL-1-1', feePart: 199_00n, principalPart: 3_000_00n });
    expect(app.transitionAdvance).toHaveBeenCalledWith(expect.objectContaining({ from: 'DISBURSED', to: 'REPAID' }));
  });

  it('partial balance → collects what is available (fee first) and marks PARTIALLY_REPAID', async () => {
    bank.getAccountBalance.mockResolvedValue(1_000_00n);
    bank.debitAccount.mockResolvedValue({ status: 'SUCCESS', debitedPaise: 1_000_00n });

    await executeAttempt(10n);

    expect(bank.debitAccount).toHaveBeenCalledWith(expect.objectContaining({ amountPaise: 1_000_00n }));
    expect(postRepayment).toHaveBeenCalledWith(expect.objectContaining({ feePart: 199_00n, principalPart: 801_00n }));
    expect(app.transitionAdvance).toHaveBeenCalledWith(expect.objectContaining({ to: 'PARTIALLY_REPAID' }));
    expect(repo.updateAttempt).toHaveBeenCalledWith(10n, expect.objectContaining({ status: 'PARTIAL' }));
  });

  it('no balance → NO_FUNDS, nothing debited', async () => {
    bank.getAccountBalance.mockResolvedValue(0n);

    await executeAttempt(10n);

    expect(bank.debitAccount).not.toHaveBeenCalled();
    expect(repo.updateAttempt).toHaveBeenCalledWith(10n, expect.objectContaining({ status: 'NO_FUNDS' }));
  });

  it('redelivered message: bank already has this clientRef → applies it, never debits again', async () => {
    bank.getDebitStatus.mockResolvedValue({ status: 'SUCCESS', debitedPaise: 3_199_00n });

    await executeAttempt(10n);

    expect(bank.debitAccount).not.toHaveBeenCalled();
    expect(bank.getAccountBalance).not.toHaveBeenCalled();
    expect(app.transitionAdvance).toHaveBeenCalledWith(expect.objectContaining({ to: 'REPAID' }));
  });

  it('bank circuit open → SKIPPED_OUTAGE (user is not penalised)', async () => {
    vi.mocked(thirdParty.isBankAvailable).mockReturnValue(false);

    await executeAttempt(10n);

    expect(repo.updateAttempt).toHaveBeenCalledWith(10n, expect.objectContaining({ status: 'SKIPPED_OUTAGE' }));
    expect(bank.getDebitStatus).not.toHaveBeenCalled();
  });

  it('attempt not IN_PROGRESS (already handled) → no-op', async () => {
    vi.mocked(repo.findAttempt).mockResolvedValue({ ...attempt, status: 'SUCCESS' } as never);
    await executeAttempt(10n);
    expect(bank.getDebitStatus).not.toHaveBeenCalled();
  });
});

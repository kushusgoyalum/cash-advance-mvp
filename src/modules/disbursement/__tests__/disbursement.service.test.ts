import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@database/index.js', () => ({
  runTransactional: (fn: () => Promise<unknown>) => fn(),
  getRedisClient: () => ({ get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') }),
  isUniqueConstraintError: () => false,
}));
vi.mock('@common/index.js', async (orig) => ({
  ...(await orig<object>()),
  acquireRateToken: vi.fn(),
  acquireLock: vi.fn().mockResolvedValue({ token: 't', release: vi.fn() }),
  isPaused: vi.fn().mockResolvedValue(false),
}));
vi.mock('@modules/application/index.js', () => ({ getAdvanceById: vi.fn(), transitionAdvance: vi.fn() }));
vi.mock('@modules/ledger/index.js', () => ({ postDisbursal: vi.fn() }));
const bank = { initiatePayout: vi.fn(), getPayoutStatus: vi.fn() };
vi.mock('@modules/thirdParty/index.js', () => ({
  getBankingProvider: () => bank,
  getPlatformClient: () => ({ getUserProfile: vi.fn().mockResolvedValue({ accountRef: 'ACC-7' }) }),
}));
vi.mock('../disbursement.repo.js', () => ({ findById: vi.fn(), updateDisbursement: vi.fn() }));

const { ProviderError } = await import('@common/index.js');
const app = await import('@modules/application/index.js');
const { postDisbursal } = await import('@modules/ledger/index.js');
const repo = await import('../disbursement.repo.js');
const { executePayout } = await import('../disbursement.service.js');

const base = {
  id: 5n, advanceId: 1n, clientRef: 'DSB-1-1', payoutAttempt: 1, amountPaise: 3_000_00n,
  status: 'INITIATED', retryCount: 0, firstTriedAt: null, providerRef: null,
};
const advance = { id: 1n, userId: 7n, publicId: 'P', status: 'DISBURSEMENT_PENDING', tenureDays: 15, principalPaise: 3_000_00n, feePaise: 199_00n };

describe('executePayout — never pay twice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(app.getAdvanceById).mockResolvedValue({ ...advance } as never);
  });

  it('first attempt success → DISBURSED with ledger, no status query needed', async () => {
    vi.mocked(repo.findById).mockResolvedValue({ ...base } as never);
    bank.initiatePayout.mockResolvedValue({ status: 'SUCCESS', utr: 'UTR1' });

    await executePayout(5n);

    expect(bank.getPayoutStatus).not.toHaveBeenCalled();
    expect(bank.initiatePayout).toHaveBeenCalledWith(expect.objectContaining({ clientRef: 'DSB-1-1', amountPaise: 3_000_00n }));
    expect(postDisbursal).toHaveBeenCalledOnce();
    expect(app.transitionAdvance).toHaveBeenCalledWith(expect.objectContaining({ from: 'DISBURSEMENT_PENDING', to: 'DISBURSED' }));
  });

  it('timeout → UNKNOWN (outcome unknown), advance is NOT failed', async () => {
    vi.mocked(repo.findById).mockResolvedValue({ ...base } as never);
    bank.initiatePayout.mockRejectedValue(new ProviderError('TIMEOUT', 'timed out'));

    await executePayout(5n);

    expect(repo.updateDisbursement).toHaveBeenCalledWith(5n, expect.objectContaining({ status: 'UNKNOWN' }));
    expect(app.transitionAdvance).not.toHaveBeenCalled();
  });

  it('resume after UNKNOWN: bank says SUCCESS → completes WITHOUT re-sending', async () => {
    vi.mocked(repo.findById).mockResolvedValue({ ...base, status: 'UNKNOWN', retryCount: 1, firstTriedAt: new Date() } as never);
    bank.getPayoutStatus.mockResolvedValue({ status: 'SUCCESS', utr: 'UTR1' });

    await executePayout(5n);

    expect(bank.initiatePayout).not.toHaveBeenCalled();
    expect(app.transitionAdvance).toHaveBeenCalledWith(expect.objectContaining({ to: 'DISBURSED' }));
  });

  it('resume after UNKNOWN: bank says NOT_FOUND → re-sends with the SAME clientRef', async () => {
    vi.mocked(repo.findById).mockResolvedValue({ ...base, status: 'UNKNOWN', retryCount: 1, firstTriedAt: new Date() } as never);
    bank.getPayoutStatus.mockResolvedValue({ status: 'NOT_FOUND' });
    bank.initiatePayout.mockResolvedValue({ status: 'PENDING', providerRef: 'P1' });

    await executePayout(5n);

    expect(bank.initiatePayout).toHaveBeenCalledWith(expect.objectContaining({ clientRef: 'DSB-1-1' }));
    expect(repo.updateDisbursement).toHaveBeenCalledWith(5n, expect.objectContaining({ status: 'PENDING' }));
  });

  it('bank confirms FAILED → DISBURSEMENT_FAILED (ops queue + user notified)', async () => {
    vi.mocked(repo.findById).mockResolvedValue({ ...base, status: 'PENDING', retryCount: 2, firstTriedAt: new Date() } as never);
    bank.getPayoutStatus.mockResolvedValue({ status: 'FAILED', failureCode: 'ACCOUNT_CLOSED' });

    await executePayout(5n);

    expect(app.transitionAdvance).toHaveBeenCalledWith(expect.objectContaining({ to: 'DISBURSEMENT_FAILED', reason: 'ACCOUNT_CLOSED' }));
  });

  it('circuit open → stays PENDING for retry (outage never fails a payout)', async () => {
    vi.mocked(repo.findById).mockResolvedValue({ ...base } as never);
    bank.initiatePayout.mockRejectedValue(new ProviderError('CIRCUIT_OPEN', 'open'));

    await executePayout(5n);

    expect(repo.updateDisbursement).toHaveBeenCalledWith(5n, expect.objectContaining({ status: 'PENDING' }));
    expect(app.transitionAdvance).not.toHaveBeenCalled();
  });

  it('already SUCCESS → no-op (duplicate message)', async () => {
    vi.mocked(repo.findById).mockResolvedValue({ ...base, status: 'SUCCESS' } as never);
    await executePayout(5n);
    expect(bank.initiatePayout).not.toHaveBeenCalled();
    expect(bank.getPayoutStatus).not.toHaveBeenCalled();
  });
});

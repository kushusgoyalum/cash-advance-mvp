import { env, getBreaker, logger } from '@common/index.js';
import type { BankingProvider } from './banking.port.js';
import { httpBankProvider } from './providers/httpBank.adapter.js';
import { mockBankProvider } from './providers/mockBank.adapter.js';

export const BANK_BREAKER = 'banking-provider';

const raw = (): BankingProvider => (env.USE_MOCK_PROVIDERS ? mockBankProvider : httpBankProvider);

/**
 * Every banking call goes through the circuit breaker. While it is OPEN calls fail fast with
 * ProviderError('CIRCUIT_OPEN') and the callers keep work queued (design §4.3).
 */
export const getBankingProvider = (): BankingProvider => {
  const p = raw();
  const b = getBreaker(BANK_BREAKER);
  return {
    getEscrowBalance: () => b.exec(() => p.getEscrowBalance()),
    initiatePayout: (r) => b.exec(() => p.initiatePayout(r)),
    getPayoutStatus: (c) => b.exec(() => p.getPayoutStatus(c)),
    getAccountBalance: (a) => b.exec(() => p.getAccountBalance(a)),
    debitAccount: (r) => b.exec(() => p.debitAccount(r)),
    getDebitStatus: (c) => b.exec(() => p.getDebitStatus(c)),
    getStatement: (a, d) => b.exec(() => p.getStatement(a, d)),
  };
};

export const isBankAvailable = (): boolean => !getBreaker(BANK_BREAKER).isOpen();

/**
 * Health probe (every 60s): the escrow balance-check API answering 200 = "reachable".
 * It is a HINT for the breaker (fast open on failure, early half-open on success) and
 * returns the funding balance for the low-funds alert. Real traffic stays the authority.
 */
export const probeBankHealth = async (): Promise<{ healthy: boolean; escrowBalancePaise: bigint | null }> => {
  const breaker = getBreaker(BANK_BREAKER);
  try {
    const balance = await raw().getEscrowBalance();
    breaker.reportProbe(true);
    return { healthy: true, escrowBalancePaise: balance };
  } catch (err) {
    logger.warn({ err }, 'bank health probe failed');
    breaker.reportProbe(false);
    return { healthy: false, escrowBalancePaise: null };
  }
};

import type { BankingProvider, DebitResult, PayoutResult } from '../banking.port.js';

/** Deterministic in-memory bank for local runs. Idempotent on clientRef like the real one. */
const payouts = new Map<string, PayoutResult>();
const debits = new Map<string, DebitResult>();
const balances = new Map<string, bigint>();

export const mockBankProvider: BankingProvider = {
  async getEscrowBalance() {
    return 10_000_000_00n;
  },
  async initiatePayout(req) {
    const existing = payouts.get(req.clientRef);
    if (existing) return existing;
    const res: PayoutResult = { status: 'SUCCESS', providerRef: `P${payouts.size + 1}`, utr: `UTR${Date.now()}` };
    payouts.set(req.clientRef, res);
    return res;
  },
  async getPayoutStatus(clientRef) {
    return payouts.get(clientRef) ?? { status: 'NOT_FOUND' };
  },
  async getAccountBalance(userAccountRef) {
    return balances.get(userAccountRef) ?? 5_000_00n;
  },
  async debitAccount(req) {
    const existing = debits.get(req.clientRef);
    if (existing) return existing;
    const balance = balances.get(req.userAccountRef) ?? 5_000_00n;
    const res: DebitResult =
      balance >= req.amountPaise
        ? { status: 'SUCCESS', providerRef: `D${debits.size + 1}`, debitedPaise: req.amountPaise }
        : { status: 'FAILED', failureCode: 'INSUFFICIENT_FUNDS' };
    if (res.status === 'SUCCESS') balances.set(req.userAccountRef, balance - req.amountPaise);
    debits.set(req.clientRef, res);
    return res;
  },
  async getDebitStatus(clientRef) {
    return debits.get(clientRef) ?? { status: 'NOT_FOUND' };
  },
  async getStatement() {
    return [];
  },
};

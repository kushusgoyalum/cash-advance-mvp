import { env } from '@common/index.js';
import { httpJson } from '../../http.js';
import type { BankingProvider, DebitResult, PayoutResult, StatementEntry } from '../banking.port.js';

const call = <T>(operation: string, method: 'GET' | 'POST', path: string, body?: unknown, clientRef?: string): Promise<T> =>
  httpJson<T>({
    provider: 'bank',
    operation,
    baseUrl: env.BANK_BASE_URL,
    method,
    path,
    headers: { 'x-api-key': env.BANK_API_KEY, ...(clientRef ? { 'Idempotency-Key': clientRef } : {}) },
    ...(body !== undefined ? { body } : {}),
    ...(clientRef ? { clientRef } : {}),
  });

interface RawTxn {
  status: PayoutResult['status'];
  providerRef?: string;
  utr?: string;
  failureCode?: string;
  amount?: string;
}

const toDebit = (r: RawTxn): DebitResult => ({
  status: r.status,
  providerRef: r.providerRef,
  debitedPaise: r.amount !== undefined ? BigInt(r.amount) : undefined,
  failureCode: r.failureCode as DebitResult['failureCode'],
});

/** Real adapter — endpoint paths are illustrative; shape follows assumption A5. */
export const httpBankProvider: BankingProvider = {
  async getEscrowBalance() {
    const r = await call<{ available: string }>('escrowBalance', 'GET', `/accounts/${env.BANK_ESCROW_ACCOUNT_ID}/balance`);
    return BigInt(r.available);
  },
  async initiatePayout(req) {
    const r = await call<RawTxn>('payout', 'POST', '/payouts', {
      fromAccountId: env.BANK_ESCROW_ACCOUNT_ID,
      toAccountRef: req.beneficiaryAccountRef,
      amount: req.amountPaise,
      narration: req.narration,
    }, req.clientRef);
    return { status: r.status, providerRef: r.providerRef, utr: r.utr, failureCode: r.failureCode };
  },
  async getPayoutStatus(clientRef) {
    const r = await call<RawTxn>('payoutStatus', 'GET', `/payouts/by-client-ref/${encodeURIComponent(clientRef)}`);
    return { status: r.status, providerRef: r.providerRef, utr: r.utr, failureCode: r.failureCode };
  },
  async getAccountBalance(userAccountRef) {
    const r = await call<{ available: string }>('userBalance', 'GET', `/accounts/${encodeURIComponent(userAccountRef)}/balance`);
    return BigInt(r.available);
  },
  async debitAccount(req) {
    return toDebit(await call<RawTxn>('debit', 'POST', '/debits', {
      fromAccountRef: req.userAccountRef,
      toAccountId: env.BANK_COLLECTION_ACCOUNT_ID,
      amount: req.amountPaise,
      consentRef: req.consentRef,
    }, req.clientRef));
  },
  async getDebitStatus(clientRef) {
    return toDebit(await call<RawTxn>('debitStatus', 'GET', `/debits/by-client-ref/${encodeURIComponent(clientRef)}`));
  },
  async getStatement(accountId, businessDate) {
    const r = await call<{ entries: Array<Omit<StatementEntry, 'amountPaise'> & { amount: string }> }>(
      'statement', 'GET', `/accounts/${accountId}/statement?date=${businessDate}`,
    );
    return r.entries.map(({ amount, ...e }) => ({ ...e, amountPaise: BigInt(amount) }));
  },
};

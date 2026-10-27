/** Banking provider capability port (assumption A5). Adapters: http (real) + mock (local/tests). */
export type ProviderTxnStatus = 'SUCCESS' | 'FAILED' | 'PENDING' | 'NOT_FOUND';

export interface PayoutRequest {
  clientRef: string;
  amountPaise: bigint;
  beneficiaryAccountRef: string;
  narration: string;
}

export interface PayoutResult {
  status: ProviderTxnStatus;
  providerRef?: string | undefined;
  utr?: string | undefined;
  failureCode?: string | undefined;
}

export interface DebitRequest {
  clientRef: string;
  userAccountRef: string;
  amountPaise: bigint;
  consentRef: string;
}

export type DebitFailureCode = 'INSUFFICIENT_FUNDS' | 'ACCOUNT_FROZEN' | 'CONSENT_REVOKED' | 'OTHER';

export interface DebitResult {
  status: ProviderTxnStatus;
  providerRef?: string | undefined;
  debitedPaise?: bigint | undefined;
  failureCode?: DebitFailureCode | undefined;
}

export interface StatementEntry {
  clientRef: string | undefined;
  utr: string | undefined;
  amountPaise: bigint;
  direction: 'DR' | 'CR';
  valueDate: string;
}

export interface BankingProvider {
  /** Escrow/funding account balance — also used as the 60s health probe. */
  getEscrowBalance(): Promise<bigint>;
  /** Idempotent on clientRef (sent as the provider idempotency key). */
  initiatePayout(req: PayoutRequest): Promise<PayoutResult>;
  getPayoutStatus(clientRef: string): Promise<PayoutResult>;
  getAccountBalance(userAccountRef: string): Promise<bigint>;
  /** Consented book transfer user account → our collection account. Idempotent on clientRef. */
  debitAccount(req: DebitRequest): Promise<DebitResult>;
  getDebitStatus(clientRef: string): Promise<DebitResult>;
  getStatement(accountId: string, businessDate: string): Promise<StatementEntry[]>;
}

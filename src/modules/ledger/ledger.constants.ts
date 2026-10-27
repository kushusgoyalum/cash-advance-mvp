/** Chart of accounts used by the per-advance double-entry ledger. */
export const LedgerAccount = {
  ADVANCE_RECEIVABLE: 'ADVANCE_RECEIVABLE',
  FEE_RECEIVABLE: 'FEE_RECEIVABLE',
  FEE_INCOME: 'FEE_INCOME',
  ESCROW_BANK: 'ESCROW_BANK',
  COLLECTION_BANK: 'COLLECTION_BANK',
} as const;

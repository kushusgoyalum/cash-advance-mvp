import type { LedgerEntryType, Prisma } from '@prisma/mysql-client';
import { LedgerAccount } from './ledger.constants.js';
import * as repo from './ledger.repo.js';

const pair = (
  advanceId: bigint,
  entryType: LedgerEntryType,
  reference: string,
  drAccount: string,
  crAccount: string,
  amountPaise: bigint,
): Prisma.LedgerEntryCreateManyInput[] => [
  { advanceId, entryType, reference, account: drAccount, direction: 'DR', amountPaise },
  { advanceId, entryType, reference, account: crAccount, direction: 'CR', amountPaise },
];

/** Disbursal: receivable created against escrow cash, fee accrued as receivable/income. */
export const postDisbursal = async (args: { advanceId: bigint; reference: string; principalPaise: bigint; feePaise: bigint }) => {
  await repo.insertEntries([
    ...pair(args.advanceId, 'DISBURSAL', args.reference, LedgerAccount.ADVANCE_RECEIVABLE, LedgerAccount.ESCROW_BANK, args.principalPaise),
    ...(args.feePaise > 0n
      ? pair(args.advanceId, 'FEE', `${args.reference}:FEE`, LedgerAccount.FEE_RECEIVABLE, LedgerAccount.FEE_INCOME, args.feePaise)
      : []),
  ]);
};

/** Repayment already split fee-first by the collection module. */
export const postRepayment = async (args: { advanceId: bigint; reference: string; feePart: bigint; principalPart: bigint }) => {
  await repo.insertEntries([
    ...(args.feePart > 0n
      ? pair(args.advanceId, 'REPAY_FEE', `${args.reference}:FEE`, LedgerAccount.COLLECTION_BANK, LedgerAccount.FEE_RECEIVABLE, args.feePart)
      : []),
    ...(args.principalPart > 0n
      ? pair(args.advanceId, 'REPAY_PRINCIPAL', `${args.reference}:PRN`, LedgerAccount.COLLECTION_BANK, LedgerAccount.ADVANCE_RECEIVABLE, args.principalPart)
      : []),
  ]);
};

/**
 * Invariants checked by reconciliation: DR == CR per reference, and receivable balance ==
 * total_repayable - collected on the advance row.
 */
export const checkInvariants = async (advanceId: bigint, expectedOutstandingPaise: bigint) => {
  const entries = await repo.listForAdvance(advanceId);
  const byRef = new Map<string, bigint>();
  let receivable = 0n;
  for (const e of entries) {
    const signed = e.direction === 'DR' ? e.amountPaise : -e.amountPaise;
    byRef.set(e.reference, (byRef.get(e.reference) ?? 0n) + signed);
    if (e.account === LedgerAccount.ADVANCE_RECEIVABLE || e.account === LedgerAccount.FEE_RECEIVABLE) receivable += signed;
  }
  const unbalancedRefs = [...byRef.entries()].filter(([, v]) => v !== 0n).map(([k]) => k);
  return { balanced: unbalancedRefs.length === 0, unbalancedRefs, outstandingMatches: receivable === expectedOutstandingPaise };
};

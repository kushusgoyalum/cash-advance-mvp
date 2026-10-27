import { addDays, env, fromDateOnly, istInstant, logger } from '@common/index.js';
import { getMongoDBClient, getMySQLClient } from '@database/index.js';
import { checkInvariants } from '@modules/ledger/index.js';
import { getBankingProvider, type StatementEntry } from '@modules/thirdParty/index.js';

interface OurTxn {
  clientRef: string;
  amountPaise: bigint;
  advanceId: bigint;
}

const bucket = (statement: StatementEntry[], ours: OurTxn[]) => {
  const oursByRef = new Map(ours.map((o) => [o.clientRef, o]));
  const seen = new Set<string>();
  let matched = 0;
  const providerOnly: Array<Record<string, string>> = [];
  for (const e of statement) {
    const o = e.clientRef ? oursByRef.get(e.clientRef) : undefined;
    if (o && o.amountPaise === e.amountPaise) {
      matched += 1;
      seen.add(o.clientRef);
    } else {
      providerOnly.push({ clientRef: e.clientRef ?? '', utr: e.utr ?? '', amount: e.amountPaise.toString() });
    }
  }
  const oursOnly = ours.filter((o) => !seen.has(o.clientRef)).map((o) => ({ clientRef: o.clientRef, amount: o.amountPaise.toString() }));
  return { matched, providerOnly, oursOnly };
};

/**
 * Daily reconciliation (T+1 06:00 IST): bank statement vs our payouts/collections by clientRef,
 * three buckets (matched / provider-only / ours-only) + ledger invariants. Mismatches go to ops;
 * fixes are applied through ops-approved adjustments, never silently.
 */
export const reconcile = async (businessDate: string) => {
  const from = istInstant(businessDate, '00:00');
  const to = istInstant(addDays(businessDate, 1), '00:00');
  const db = getMySQLClient();
  const bank = getBankingProvider();

  const payouts = await db.disbursement.findMany({ where: { status: 'SUCCESS', updatedAt: { gte: from, lt: to } } });
  const collections = await db.collectionAttempt.findMany({ where: { status: { in: ['SUCCESS', 'PARTIAL'] }, updatedAt: { gte: from, lt: to } } });

  const results = [
    { account: env.BANK_ESCROW_ACCOUNT_ID, ours: payouts.map((p) => ({ clientRef: p.clientRef, amountPaise: p.amountPaise, advanceId: p.advanceId })) },
    { account: env.BANK_COLLECTION_ACCOUNT_ID, ours: collections.map((c) => ({ clientRef: c.clientRef, amountPaise: c.collectedPaise, advanceId: c.advanceId })) },
  ];

  const summary: Record<string, unknown> = {};
  for (const r of results) {
    const statement = await bank.getStatement(r.account, businessDate);
    const b = bucket(statement, r.ours);
    await getMongoDBClient().reconReport.upsert({
      where: { businessDate_account: { businessDate, account: r.account } },
      create: { businessDate, account: r.account, matched: b.matched, providerOnly: b.providerOnly, oursOnly: b.oursOnly },
      update: { matched: b.matched, providerOnly: b.providerOnly, oursOnly: b.oursOnly },
    });
    if (b.providerOnly.length || b.oursOnly.length) logger.error({ account: r.account, businessDate }, 'RECON_MISMATCH — ops queue');
    summary[r.account] = { matched: b.matched, providerOnly: b.providerOnly.length, oursOnly: b.oursOnly.length };
  }

  const touched = new Set([...payouts.map((p) => p.advanceId), ...collections.map((c) => c.advanceId)]);
  let ledgerIssues = 0;
  for (const advanceId of touched) {
    const a = await db.cashAdvance.findUnique({ where: { id: advanceId } });
    if (!a) continue;
    const inv = await checkInvariants(advanceId, a.totalRepayablePaise - a.collectedPaise);
    if (!inv.balanced || !inv.outstandingMatches) {
      ledgerIssues += 1;
      logger.error({ advanceId: advanceId.toString(), dueDate: a.dueDate ? fromDateOnly(a.dueDate) : null, inv }, 'LEDGER_INVARIANT_BROKEN');
    }
  }
  return { ...summary, ledgerIssues };
};

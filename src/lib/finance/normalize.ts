import type {
  Account,
  CategoryOverride,
  NormalizedTransaction,
  Obligation,
  ObligationStatus,
  TransactionCategory,
  TransactionKind,
} from "./types";
import { monthOf } from "./util";

const PENDING_MATCH_WINDOW_DAYS = 5;

const dayDiff = (a: string, b: string) =>
  (Date.parse(b) - Date.parse(a)) / 86_400_000;

const sameCharge = (
  pending: NormalizedTransaction,
  posted: NormalizedTransaction,
) =>
  pending.accountId === posted.accountId &&
  pending.amountCents === posted.amountCents &&
  (pending.merchantName ?? pending.description) ===
    (posted.merchantName ?? posted.description) &&
  dayDiff(pending.occurredAt, posted.occurredAt) >= 0 &&
  dayDiff(pending.occurredAt, posted.occurredAt) <= PENDING_MATCH_WINDOW_DAYS;

/** Kind implied when a player recategorizes a transaction. */
function kindForCorrection(
  tx: NormalizedTransaction,
  category: TransactionCategory,
): TransactionKind {
  if (category === "savings_transfer" || category === "investment_contribution")
    return "transfer";
  if (category === "debt_payment") return "payment";
  if (category === "income") return tx.amountCents >= 0 ? "income" : "expense";
  if (tx.kind === "income") return "refund"; // money in, now tied to a spending category
  if (tx.kind === "transfer" || tx.kind === "payment")
    return tx.isInternalTransfer ? tx.kind : "expense";
  return tx.kind;
}

/**
 * Deduplicate, drop pending charges that have posted, and apply player
 * category corrections. Returns a new sorted array; input is not mutated.
 */
export function normalizeTransactions(
  txs: NormalizedTransaction[],
  overrides: CategoryOverride[] = [],
): NormalizedTransaction[] {
  // 1. Exact duplicates (same provider record imported twice, e.g. a transfer
  //    fetched from both the payer and payee account). Prefer the posted copy.
  const byKey = new Map<string, NormalizedTransaction>();
  for (const tx of txs) {
    // Ids are source-prefixed by the adapters, so equal ids mean the same record.
    const existing = byKey.get(tx.id);
    if (!existing || (existing.pending && !tx.pending)) byKey.set(tx.id, tx);
  }
  let out = [...byKey.values()];

  // 2. Pending → posted replacement.
  const posted = out.filter((t) => !t.pending);
  out = out.filter((t) => !t.pending || !posted.some((p) => sameCharge(t, p)));

  // 3. Player corrections (latest correction per transaction wins).
  const latest = new Map<string, CategoryOverride>();
  for (const o of [...overrides].sort((a, b) =>
    a.correctedAt.localeCompare(b.correctedAt),
  )) {
    latest.set(o.transactionId, o);
  }
  out = out.map((tx) => {
    const o = latest.get(tx.id);
    if (!o) return tx;
    return {
      ...tx,
      category: o.category,
      kind: kindForCorrection(tx, o.category),
      confidence: "high",
      categorySource: "user",
    };
  });

  return out.sort(
    (a, b) =>
      a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id),
  );
}

export const inPeriod = (
  tx: NormalizedTransaction,
  month: string,
  asOf?: string,
) => monthOf(tx.occurredAt) === month && (!asOf || tx.occurredAt <= asOf);

/**
 * Net spend per category: expenses minus refunds, floored at zero.
 * Internal transfers, debt payments, savings and investing are never spending.
 */
export function netCategorySpend(
  txs: NormalizedTransaction[],
  opts: { includePending?: boolean } = {},
): Partial<Record<TransactionCategory, number>> {
  const totals: Partial<Record<TransactionCategory, number>> = {};
  for (const tx of txs) {
    if (tx.isInternalTransfer) continue;
    if (tx.pending && !opts.includePending) continue;
    if (tx.kind === "expense")
      totals[tx.category] =
        (totals[tx.category] ?? 0) + Math.abs(tx.amountCents);
    else if (tx.kind === "refund")
      totals[tx.category] =
        (totals[tx.category] ?? 0) - Math.abs(tx.amountCents);
  }
  for (const k of Object.keys(totals) as TransactionCategory[])
    totals[k] = Math.max(0, totals[k] ?? 0);
  return totals;
}

/** Why a transaction doesn't count toward spending, for the UI. Null if it counts. */
export function exclusionReason(tx: NormalizedTransaction): string | null {
  if (tx.isInternalTransfer && tx.kind === "payment")
    return "Card repayment — purchases already counted";
  if (tx.isInternalTransfer) return "Transfer between your own accounts";
  if (tx.kind === "payment") return "Debt payment — tracked under bills";
  if (tx.kind === "income")
    return tx.incomeEligible
      ? "Income"
      : "Irregular income — not used as salary";
  if (tx.kind === "transfer") return "Investment contribution";
  return null;
}

/** Re-evaluate obligation status against the as-of date. Never overdue before due. */
export function effectiveObligationStatus(
  o: Obligation,
  asOf: string,
): ObligationStatus {
  if (o.status === "paid" || o.status === "unknown") return o.status;
  return o.dueDate < asOf ? "overdue" : "due";
}

/**
 * Net new money moved into savings accounts (in − out), posted only.
 * Circular transfers net to zero; opening balances are ignored.
 */
export function netNewSavingsCents(
  txs: NormalizedTransaction[],
  accounts: Account[],
): number {
  const savingsIds = new Set(
    accounts.filter((a) => a.type === "savings").map((a) => a.id),
  );
  let net = 0;
  for (const tx of txs) {
    if (tx.pending) continue;
    const amt = Math.abs(tx.amountCents);
    if (tx.isInternalTransfer) {
      if (tx.counterpartyAccountId && savingsIds.has(tx.counterpartyAccountId))
        net += amt;
      if (tx.accountId && savingsIds.has(tx.accountId)) net -= amt;
    } else if (tx.accountId && savingsIds.has(tx.accountId)) {
      // External money directly into / out of savings (e.g. split direct deposit).
      if (tx.kind === "income" && tx.incomeEligible) net += amt;
      else if (tx.kind === "expense") net -= amt;
    }
  }
  return net;
}

/** Net investment contributions (contributions − proceeds), posted only. */
export function netInvestmentContributionsCents(
  txs: NormalizedTransaction[],
): number {
  let net = 0;
  for (const tx of txs) {
    if (
      tx.pending ||
      tx.isInternalTransfer ||
      tx.category !== "investment_contribution"
    )
      continue;
    net +=
      tx.kind === "transfer" || tx.kind === "expense"
        ? Math.abs(tx.amountCents)
        : -Math.abs(tx.amountCents);
  }
  return net;
}

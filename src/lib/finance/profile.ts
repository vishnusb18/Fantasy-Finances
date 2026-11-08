import { effectiveObligationStatus, inPeriod, netCategorySpend } from './normalize';
import type {
  Account,
  BudgetPolicy,
  DataQualityFlag,
  FinancialProfile,
  NormalizedTransaction,
  Obligation,
  PlayerConfirmations,
  TransactionCategory,
  ValueSource,
} from './types';
import { DISCRETIONARY_CATEGORIES, ESSENTIAL_CATEGORIES } from './types';
import { formatCents, median, monthOf, previousMonths, sum } from './util';

export type BuildProfileInput = {
  playerId: string;
  month: string; // scoring month, YYYY-MM
  asOf: string; // YYYY-MM-DD
  accounts: Account[];
  /** Already normalized (deduped, corrections applied). */
  transactions: NormalizedTransaction[];
  obligations: Obligation[];
  confirmations?: PlayerConfirmations;
  policy: BudgetPolicy;
  now?: string;
};

const essentialTotal = (spend: Partial<Record<TransactionCategory, number>>) =>
  sum(ESSENTIAL_CATEGORIES.map(c => spend[c] ?? 0));

export function buildFinancialProfile(input: BuildProfileInput): FinancialProfile {
  const { playerId, month, asOf, accounts, transactions, obligations, confirmations = {}, policy } = input;
  const notes: string[] = [];
  const quality = new Set<DataQualityFlag>();

  const history = previousMonths(month, policy.historyMonths);
  const monthsWithData = history.filter(m => transactions.some(t => monthOf(t.occurredAt) === m));
  const historyTx = (m: string) => transactions.filter(t => inPeriod(t, m));

  // ── Income: median of eligible net deposits per completed month ──────────
  const incomeByMonth = history.map(m =>
    sum(historyTx(m).filter(t => t.kind === 'income' && t.incomeEligible && !t.pending).map(t => Math.abs(t.amountCents)))
  );
  const incomeMonths = incomeByMonth.filter(x => x > 0);
  let income: number | null = null;
  let incomeSource: ValueSource = 'missing';
  if (incomeMonths.length > 0) {
    income = median(incomeMonths);
    incomeSource = 'verified';
    if (incomeMonths.length < history.length) {
      quality.add('limited_history');
      notes.push(
        `Income: paychecks found in ${incomeMonths.length} of ${history.length} completed months; using the median of those months (${formatCents(income!)}).`
      );
    } else {
      notes.push(`Income: median paycheck deposits over ${history.join(', ')} = ${formatCents(income!)}/mo. Transfers, refunds and one-off deposits excluded.`);
    }
    const confirmed = confirmations.monthlyNetIncomeCents;
    if (confirmed != null && income != null && Math.abs(confirmed - income) > 0.15 * income) {
      notes.push(`You reported ${formatCents(confirmed)}/mo, which differs from deposits we can see. Scoring uses the verified figure.`);
    }
  } else if (confirmations.monthlyNetIncomeCents != null) {
    income = confirmations.monthlyNetIncomeCents;
    incomeSource = 'user_confirmed';
    quality.add('income_unverified');
    notes.push(`Income: no paycheck deposits found; using your confirmed ${formatCents(income)}/mo (unverified).`);
  } else {
    quality.add('income_unverified');
    notes.push('Income: no paycheck deposits found. Confirm your monthly take-home pay to generate a budget.');
  }

  // ── Essentials: median essential spend + confirmed off-feed obligations ──
  const essentialByMonth = monthsWithData.map(m => essentialTotal(netCategorySpend(historyTx(m))));
  const observedEssentials = median(essentialByMonth);
  const extra = sum((confirmations.extraMonthlyObligations ?? []).map(o => o.amountCents));
  let essentials: number | null = null;
  let essentialsSource: ValueSource = 'missing';
  if (observedEssentials != null) {
    essentials = observedEssentials + extra;
    essentialsSource = 'verified';
    notes.push(
      `Essentials: median housing, groceries, utilities, transport and healthcare = ${formatCents(observedEssentials)}/mo` +
        (extra ? ` + ${formatCents(extra)} you confirmed isn't in your accounts.` : '.')
    );
  } else if (extra > 0) {
    essentials = extra;
    essentialsSource = 'user_confirmed';
    notes.push(`Essentials: only your confirmed obligations (${formatCents(extra)}/mo) — no spending history yet.`);
  }
  const sawHousing =
    monthsWithData.some(m => (netCategorySpend(historyTx(m)).housing ?? 0) > 0) ||
    (confirmations.extraMonthlyObligations ?? []).some(o => /rent|housing|mortgage/i.test(o.label));
  if (!sawHousing) {
    quality.add('missing_obligations');
    notes.push('No rent or housing payment found. If you pay rent elsewhere, add it so your budget is realistic.');
  }

  // ── Required debt minimums ──────────────────────────────────────────────
  const debtIn = (m: string) =>
    sum(obligations.filter(o => o.kind === 'debt_minimum' && monthOf(o.dueDate) === m).map(o => o.amountCents));
  let debt = debtIn(month);
  if (debt === 0) debt = median(history.map(debtIn).filter(x => x > 0)) ?? 0;
  notes.push(debt ? `Required debt minimums: ${formatCents(debt)}/mo from scheduled bills.` : 'No required debt payments found.');

  // ── Reserve buffer (policy, illustrative) ───────────────────────────────
  const reserve = income == null ? null : Math.max(policy.reserveFloorCents, Math.round(income * policy.reservePct));
  if (reserve != null) {
    notes.push(
      `Held-back buffer: ${formatCents(reserve)} (${Math.round(policy.reservePct * 100)}% of income, min ${formatCents(policy.reserveFloorCents)}). An illustrative safety margin, not scored as savings.`
    );
  }

  // ── Balances (liquidity only) ───────────────────────────────────────────
  const checking = accounts.filter(a => a.type === 'checking');
  if (checking.length === 0) quality.add('missing_accounts');
  const savings = accounts.filter(a => a.type === 'savings');

  // ── Category history (average per month with data) ──────────────────────
  const categorySpendHistoryCents: Partial<Record<TransactionCategory, number>> = {};
  if (monthsWithData.length) {
    for (const m of monthsWithData) {
      const spend = netCategorySpend(historyTx(m));
      for (const [k, v] of Object.entries(spend) as [TransactionCategory, number][]) {
        categorySpendHistoryCents[k] = (categorySpendHistoryCents[k] ?? 0) + v;
      }
    }
    for (const k of Object.keys(categorySpendHistoryCents) as TransactionCategory[]) {
      categorySpendHistoryCents[k] = Math.round(categorySpendHistoryCents[k]! / monthsWithData.length);
    }
  }
  if (monthsWithData.length < history.length) quality.add('limited_history');

  // ── Category confidence ─────────────────────────────────────────────────
  const scoredCats = new Set<TransactionCategory>([...DISCRETIONARY_CATEGORIES, ...ESSENTIAL_CATEGORIES, 'other']);
  const spendTx = transactions.filter(
    t => t.kind === 'expense' && !t.isInternalTransfer && scoredCats.has(t.category) && t.occurredAt <= asOf
  );
  const lowShare =
    sum(spendTx.filter(t => t.confidence === 'low').map(t => Math.abs(t.amountCents))) /
    Math.max(1, sum(spendTx.map(t => Math.abs(t.amountCents))));
  if (lowShare > policy.uncertainCategoryShare) {
    quality.add('categories_uncertain');
    notes.push(`${Math.round(lowShare * 100)}% of spending has an uncertain category. Review the transactions list to correct them.`);
  }

  return {
    playerId,
    month,
    estimatedMonthlyNetIncomeCents: income,
    essentialMonthlyExpensesCents: essentials,
    requiredMonthlyDebtPaymentsCents: debt,
    reserveAllocationCents: reserve,
    availableCheckingBalanceCents: checking.length ? sum(checking.map(a => a.balanceCents)) : null,
    existingSavingsBalanceCents: savings.length ? sum(savings.map(a => a.balanceCents)) : null,
    categorySpendHistoryCents,
    obligations: obligations
      .filter(o => monthOf(o.dueDate) === month)
      .map(o => ({ ...o, status: effectiveObligationStatus(o, asOf) }))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    dataQuality: [...quality],
    lastCalculatedAt: input.now ?? new Date().toISOString(),
    sources: {
      income: incomeSource,
      essentials: essentialsSource,
      debt: 'verified',
      reserve: reserve == null ? 'missing' : 'policy',
    },
    notes,
    hasInvestmentActivity: history.some(m => historyTx(m).some(t => t.category === 'investment_contribution' && !t.pending)),
  };
}

import { categorizeByText, categorizePurchase } from '../../categorize';
import type {
  Account,
  AccountType,
  DataSource,
  NormalizedTransaction,
  Obligation,
  ProviderData,
} from '../../types';
import { dollarsToCents } from '../../util';
import type { NessieAccount, NessieBundle, NessieTxStatus } from './types';

const REFUND_RE = /\b(refund|reversal|returned?|chargeback)\b/i;
const INVESTMENT_RE = /\b(vanguard|fidelity|schwab|robinhood|brokerage|roth|ira|401k|dividend)\b/i;
const ATM_RE = /\b(atm|cash withdrawal)\b/i;

const accountType = (a: NessieAccount): AccountType => {
  const t = a.type.toLowerCase();
  if (t.includes('checking')) return 'checking';
  if (t.includes('saving')) return 'savings';
  if (t.includes('credit')) return 'credit_card';
  return 'other';
};

/**
 * The live Nessie API stores no destination on transfers. Infer it from the
 * description ("Transfer to savings"), but only when exactly one of the
 * customer's OTHER accounts matches — otherwise treat it as money sent out.
 */
export function resolveTransferDestination(description: string, from: Account | undefined, accounts: Account[]): Account | undefined {
  const d = description.toLowerCase();
  const wanted: AccountType | null = /\bto (my |the )?savings\b/.test(d)
    ? 'savings'
    : /\bto (my |the )?checking\b/.test(d)
      ? 'checking'
      : /\b(to (my |the )?(credit )?card|card payment)\b/.test(d)
        ? 'credit_card'
        : null;
  if (!wanted) return undefined;
  const candidates = accounts.filter(a => a.type === wanted && a.id !== from?.id);
  return candidates.length === 1 ? candidates[0] : undefined;
}

const isLive = (s: NessieTxStatus | string) => s !== 'cancelled';
const isPending = (s: NessieTxStatus | string) => s === 'pending';

/**
 * Convert one Nessie customer's raw objects into the provider-neutral model.
 * `source` is 'nessie' for live API data and 'seed' for the offline sample,
 * which uses the same Nessie shapes so both go through this exact code path.
 */
export function nessieToProviderData(bundle: NessieBundle, source: DataSource = 'nessie'): ProviderData {
  const playerId = `${source}:${bundle.customer._id}`;
  const id = (raw: string) => `${source}:${raw}`;

  const accounts: Account[] = bundle.accounts.map(a => ({
    id: id(a._id),
    playerId,
    source,
    type: accountType(a),
    nickname: a.nickname,
    balanceCents: dollarsToCents(a.balance),
  }));
  const accountById = new Map(accounts.map(a => [a.id, a]));
  const ownAccount = (rawId: string) => accountById.get(id(rawId));
  const merchantById = new Map(bundle.merchants.map(m => [m._id, m]));

  const txs: NormalizedTransaction[] = [];
  const base = (rawId: string) => ({ id: id(rawId), playerId, source, sourceTransactionId: rawId });

  for (const p of bundle.purchases) {
    if (!isLive(p.status)) continue;
    const m = merchantById.get(p.merchant_id);
    const tags = Array.isArray(m?.category) ? m.category : m?.category ? [m.category] : undefined;
    const guess = categorizePurchase(m?.name, tags, p.description);
    txs.push({
      ...base(p._id),
      occurredAt: p.purchase_date,
      amountCents: -dollarsToCents(p.amount),
      merchantName: m?.name,
      description: p.description,
      category: guess.category,
      kind: 'expense',
      accountId: id(p.payer_id),
      pending: isPending(p.status),
      confidence: guess.confidence,
      categorySource: guess.source,
    });
  }

  for (const d of bundle.deposits) {
    if (!isLive(d.status)) continue;
    const desc = d.description ?? '';
    const common = {
      ...base(d._id),
      occurredAt: d.transaction_date,
      amountCents: dollarsToCents(d.amount),
      description: desc,
      accountId: id(d.payee_id),
      pending: isPending(d.status),
    };
    if (REFUND_RE.test(desc)) {
      const guess = categorizeByText(desc.replace(REFUND_RE, ''));
      txs.push({
        ...common,
        category: guess?.category ?? 'other',
        kind: 'refund',
        confidence: guess ? 'medium' : 'low',
        categorySource: guess ? 'rule' : 'default',
      });
    } else if (categorizeByText(desc)?.category === 'income') {
      txs.push({ ...common, category: 'income', kind: 'income', confidence: 'high', categorySource: 'rule', incomeEligible: true });
    } else {
      // Gifts, P2P, investment proceeds, etc.: real money, but not dependable salary.
      txs.push({
        ...common,
        category: 'income',
        kind: 'income',
        confidence: INVESTMENT_RE.test(desc) ? 'medium' : 'low',
        categorySource: 'rule',
        incomeEligible: false,
      });
    }
  }

  for (const w of bundle.withdrawals) {
    if (!isLive(w.status)) continue;
    const desc = w.description ?? '';
    const common = {
      ...base(w._id),
      occurredAt: w.transaction_date,
      amountCents: -dollarsToCents(w.amount),
      description: desc,
      accountId: id(w.payer_id),
      pending: isPending(w.status),
    };
    if (INVESTMENT_RE.test(desc)) {
      txs.push({ ...common, category: 'investment_contribution', kind: 'transfer', confidence: 'medium', categorySource: 'rule' });
    } else if (ATM_RE.test(desc)) {
      txs.push({ ...common, category: 'other', kind: 'expense', confidence: 'low', categorySource: 'rule' });
    } else {
      const guess = categorizeByText(desc);
      txs.push({
        ...common,
        category: guess?.category ?? 'other',
        kind: 'expense',
        confidence: guess?.confidence ?? 'low',
        categorySource: guess ? 'rule' : 'default',
      });
    }
  }

  for (const t of bundle.transfers) {
    if (!isLive(t.status)) continue;
    const from = ownAccount(t.payer_id);
    const desc = t.description ?? '';
    const to = t.payee_id ? ownAccount(t.payee_id) : resolveTransferDestination(desc, from, accounts);
    const common = {
      ...base(t._id),
      occurredAt: t.transaction_date,
      description: desc,
      pending: isPending(t.status),
    };
    if (from && to) {
      // Internal: never income, never spending.
      const toCard = to.type === 'credit_card';
      const savingsLeg = to.type === 'savings' || from.type === 'savings';
      txs.push({
        ...common,
        amountCents: -dollarsToCents(t.amount),
        accountId: from.id,
        counterpartyAccountId: to.id,
        category: toCard ? 'debt_payment' : savingsLeg ? 'savings_transfer' : 'other',
        kind: toCard ? 'payment' : 'transfer',
        confidence: 'high',
        categorySource: 'rule',
        isInternalTransfer: true,
      });
    } else if (from) {
      // Money sent to someone else (e.g. paying a friend back for dinner).
      const guess = categorizeByText(desc);
      txs.push({
        ...common,
        amountCents: -dollarsToCents(t.amount),
        accountId: from.id,
        category: guess?.category ?? 'other',
        kind: 'expense',
        confidence: guess?.confidence ?? 'low',
        categorySource: guess ? 'rule' : 'default',
      });
    } else if (to) {
      txs.push({
        ...common,
        amountCents: dollarsToCents(t.amount),
        accountId: to.id,
        category: 'income',
        kind: 'income',
        confidence: 'low',
        categorySource: 'rule',
        incomeEligible: false,
      });
    }
  }

  const obligations: Obligation[] = [];
  for (const b of bundle.bills) {
    if (b.status === 'cancelled') continue;
    const label = `${b.payee} ${b.nickname ?? ''}`;
    const guess = categorizeByText(label);
    const isDebt = guess?.category === 'debt_payment';
    // payment_date is this bill's own date. The live API auto-fills
    // upcoming_payment_date with the NEXT recurrence, so it's only a fallback.
    const dueDate = b.payment_date ?? b.upcoming_payment_date ?? b.creation_date ?? '';
    if (!dueDate) continue;
    const amountCents = dollarsToCents(b.payment_amount);
    const paid = b.status === 'completed';
    obligations.push({
      id: id(b._id),
      playerId,
      source,
      payee: b.nickname || b.payee,
      kind: isDebt ? 'debt_minimum' : 'essential',
      amountCents,
      dueDate,
      status: paid ? 'paid' : 'due',
    });
    if (paid) {
      // A paid bill is also a cash outflow. Debt payments are tracked as
      // payments, not spending, so card purchases aren't counted twice.
      txs.push({
        ...base(b._id),
        id: id(`bill-${b._id}`),
        occurredAt: b.payment_date ?? dueDate,
        amountCents: -amountCents,
        merchantName: b.payee,
        description: b.nickname,
        category: guess?.category ?? 'other',
        kind: isDebt ? 'payment' : 'expense',
        accountId: id(b.account_id),
        confidence: guess?.confidence ?? 'low',
        categorySource: guess ? 'rule' : 'default',
      });
    }
  }

  return {
    playerId,
    displayName: `${bundle.customer.first_name} ${bundle.customer.last_name}`.trim(),
    source,
    accounts,
    transactions: txs,
    obligations,
  };
}

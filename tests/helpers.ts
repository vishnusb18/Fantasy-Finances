import type {
  Account,
  FinancialProfile,
  NormalizedTransaction,
  Obligation,
  ScoringBaseline,
} from '../src/lib/finance/types';
import { DEFAULT_POLICY } from '../src/lib/finance/policy';
import { generateBudgetBaseline } from '../src/lib/finance/baseline';

export const P = 'test:p1';
export const NOW = '2026-11-07T12:00:00.000Z';
export const policy = DEFAULT_POLICY;

export const accounts: Account[] = [
  { id: 'chk', playerId: P, source: 'manual', type: 'checking', nickname: 'Checking', balanceCents: 150_000 },
  { id: 'sav', playerId: P, source: 'manual', type: 'savings', nickname: 'Savings', balanceCents: 500_000 },
  { id: 'card', playerId: P, source: 'manual', type: 'credit_card', nickname: 'Card', balanceCents: 20_000 },
];

let seq = 0;
export function tx(p: Partial<NormalizedTransaction> & Pick<NormalizedTransaction, 'occurredAt' | 'amountCents'>): NormalizedTransaction {
  return {
    id: p.id ?? `t${++seq}`,
    playerId: P,
    source: 'manual',
    category: 'other',
    kind: 'expense',
    accountId: 'chk',
    confidence: 'high',
    categorySource: 'rule',
    ...p,
  };
}

export const spend = (date: string, cents: number, category: NormalizedTransaction['category'], extra: Partial<NormalizedTransaction> = {}) =>
  tx({ occurredAt: date, amountCents: -cents, category, kind: 'expense', ...extra });

export const paycheck = (date: string, cents: number) =>
  tx({ occurredAt: date, amountCents: cents, category: 'income', kind: 'income', incomeEligible: true });

export const toSavings = (date: string, cents: number) =>
  tx({ occurredAt: date, amountCents: -cents, category: 'savings_transfer', kind: 'transfer', isInternalTransfer: true, accountId: 'chk', counterpartyAccountId: 'sav' });

export const bill = (id: string, dueDate: string, cents: number, status: Obligation['status'] = 'paid', kind: Obligation['kind'] = 'essential'): Obligation => ({
  id,
  playerId: P,
  source: 'manual',
  payee: id,
  kind,
  amountCents: cents,
  dueDate,
  status,
});

/** A hand-built profile so baseline tests don't depend on profile inference. */
export function profileWith(p: Partial<FinancialProfile>): FinancialProfile {
  return {
    playerId: P,
    month: '2026-11',
    estimatedMonthlyNetIncomeCents: 300_000,
    essentialMonthlyExpensesCents: 180_000,
    requiredMonthlyDebtPaymentsCents: 30_000,
    reserveAllocationCents: 20_000,
    availableCheckingBalanceCents: 150_000,
    existingSavingsBalanceCents: 500_000,
    categorySpendHistoryCents: { dining_out: 20_000, nightlife: 5_000, entertainment: 5_000, shopping: 10_000, subscriptions: 2_000 },
    obligations: [],
    dataQuality: [],
    lastCalculatedAt: NOW,
    sources: { income: 'verified', essentials: 'verified', debt: 'verified', reserve: 'policy' },
    notes: [],
    hasInvestmentActivity: true,
    ...p,
  };
}

export const baselineFor = (p: Partial<FinancialProfile>): ScoringBaseline =>
  generateBudgetBaseline(profileWith(p), policy, { now: NOW });

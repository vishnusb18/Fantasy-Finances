import { describe, expect, it } from 'vitest';
import { nessieToProviderData } from '../src/lib/finance/adapters/nessie/toProviderData';
import { budgetableCapacityCents, safeToMoveNowCents } from '../src/lib/finance/affordability';
import { generatePersonaBundle, PERSONAS } from '../src/lib/finance/demo/personas';
import { normalizeTransactions } from '../src/lib/finance/normalize';
import { buildFinancialProfile } from '../src/lib/finance/profile';
import type { PlayerConfirmations, ProviderData } from '../src/lib/finance/types';
import { NOW, policy } from './helpers';

const AS_OF = '2026-11-07';
const persona = (key: string) =>
  nessieToProviderData(generatePersonaBundle(PERSONAS.find(p => p.key === key)!, AS_OF), 'seed');

const profileOf = (data: ProviderData, confirmations?: PlayerConfirmations) =>
  buildFinancialProfile({
    playerId: data.playerId,
    month: '2026-11',
    asOf: AS_OF,
    accounts: data.accounts,
    transactions: normalizeTransactions(data.transactions),
    obligations: data.obligations,
    confirmations,
    policy,
    now: NOW,
  });

describe('buildFinancialProfile — two different situations', () => {
  const maya = profileOf(persona('maya'));
  const jordan = profileOf(persona('jordan'));

  it('estimates take-home pay from payroll only (gift deposit excluded)', () => {
    expect(maya.estimatedMonthlyNetIncomeCents).toBe(105_000);
    expect(jordan.estimatedMonthlyNetIncomeCents).toBe(300_000);
    expect(maya.sources.income).toBe('verified');
  });

  it('derives essentials, debt minimums and the policy buffer', () => {
    // Rent + phone/utilities are exact; groceries/transport are jittered.
    expect(maya.essentialMonthlyExpensesCents).toBeGreaterThan(65_000);
    expect(maya.essentialMonthlyExpensesCents).toBeLessThan(80_000);
    expect(jordan.essentialMonthlyExpensesCents).toBeGreaterThan(165_000);
    expect(jordan.essentialMonthlyExpensesCents).toBeLessThan(195_000);
    expect(maya.requiredMonthlyDebtPaymentsCents).toBe(2_500);
    expect(jordan.requiredMonthlyDebtPaymentsCents).toBe(30_000);
    expect(maya.reserveAllocationCents).toBe(5_250);
    expect(jordan.reserveAllocationCents).toBe(15_000);
  });

  it('records investing activity only where it exists', () => {
    expect(maya.hasInvestmentActivity).toBe(false);
    expect(jordan.hasInvestmentActivity).toBe(true);
  });

  it('re-evaluates this month’s bills against the as-of date', () => {
    expect(maya.obligations.map(o => [o.payee, o.status])).toEqual([
      ['Rent (my share)', 'paid'],
      ['Phone bill', 'due'],
      ['Card payment (minimum)', 'due'],
    ]);
  });

  it('capacity does not depend on the checking balance', () => {
    const rich = { ...maya, availableCheckingBalanceCents: 5_000_000 };
    expect(budgetableCapacityCents(rich)).toBe(budgetableCapacityCents(maya));
    expect(safeToMoveNowCents(rich, policy)).toBeGreaterThan(safeToMoveNowCents(maya, policy)!);
  });
});

describe('buildFinancialProfile — missing deposits', () => {
  const base = persona('maya');
  const withoutPay = (months: string[]): ProviderData => ({
    ...base,
    transactions: base.transactions.filter(t => !(t.incomeEligible && months.some(m => t.occurredAt.startsWith(m)))),
  });

  it('uses the remaining months and flags limited history', () => {
    const p = profileOf(withoutPay(['2026-09']));
    expect(p.estimatedMonthlyNetIncomeCents).toBe(105_000);
    expect(p.dataQuality).toContain('limited_history');
  });

  it('returns null income (not a guess) when no paychecks are visible', () => {
    const p = profileOf(withoutPay(['2026-08', '2026-09', '2026-10']));
    expect(p.estimatedMonthlyNetIncomeCents).toBeNull();
    expect(p.dataQuality).toContain('income_unverified');
    expect(budgetableCapacityCents(p)).toBeNull();
  });

  it('falls back to a user-confirmed figure, labeled unverified', () => {
    const p = profileOf(withoutPay(['2026-08', '2026-09', '2026-10']), { monthlyNetIncomeCents: 100_000 });
    expect(p.estimatedMonthlyNetIncomeCents).toBe(100_000);
    expect(p.sources.income).toBe('user_confirmed');
    expect(p.dataQuality).toContain('income_unverified');
  });

  it('adds confirmed off-feed obligations to essentials', () => {
    const before = profileOf(base).essentialMonthlyExpensesCents!;
    const after = profileOf(base, { extraMonthlyObligations: [{ label: 'Car insurance (paid by parent card)', amountCents: 9_000 }] });
    expect(after.essentialMonthlyExpensesCents).toBe(before + 9_000);
  });
});

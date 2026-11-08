import { describe, expect, it } from 'vitest';
import { createPersonalBudget, generateBudgetBaseline, updatePersonalBudget } from '../src/lib/finance/baseline';
import { DISCRETIONARY_CATEGORIES } from '../src/lib/finance/types';
import { sum } from '../src/lib/finance/util';
import { baselineFor, bill, NOW, policy, profileWith } from './helpers';

describe('generateBudgetBaseline', () => {
  it('matches the illustrative $3,000 profile (capacity $700)', () => {
    const b = baselineFor({});
    expect(b.status).toBe('locked');
    expect(b.budgetableCapacityCents).toBe(70_000);
    expect(b.discretionary.totalCents).toBe(35_000);
    expect(b.savings.targetCents).toBe(24_500);
    expect(b.investing).toMatchObject({ eligible: true, targetCents: 10_500 });
  });

  it('category budgets always sum to the locked discretionary total', () => {
    const b = baselineFor({});
    expect(sum(DISCRETIONARY_CATEGORIES.map(c => b.discretionary.categories[c].budgetCents))).toBe(b.discretionary.totalCents);
  });

  it('gives an unseen category no separate budget (no free points)', () => {
    const b = baselineFor({ categorySpendHistoryCents: { dining_out: 10_000, shopping: 10_000 } });
    expect(b.discretionary.categories.nightlife).toMatchObject({ budgetCents: 0, eligible: false });
  });

  it('preferences reshape categories but never the total', () => {
    const b = generateBudgetBaseline(profileWith({}), policy, { now: NOW, categoryPreferences: { dining_out: 1 } });
    expect(b.discretionary.categories.dining_out.budgetCents).toBe(35_000);
    expect(b.discretionary.totalCents).toBe(35_000);
  });

  it('makes investing ineligible without an investment account, moving its share to savings', () => {
    const b = baselineFor({ hasInvestmentActivity: false });
    expect(b.investing).toMatchObject({ eligible: false, targetCents: 0 });
    expect(b.savings.targetCents).toBe(35_000);
  });

  it('puts catching up on overdue bills ahead of investing', () => {
    const b = baselineFor({ obligations: [bill('rent', '2026-11-01', 100_000, 'overdue')] });
    expect(b.investing.eligible).toBe(false);
  });

  it('zero capacity → cautious plan: spending and savings not scored, bills still are', () => {
    const b = baselineFor({ essentialMonthlyExpensesCents: 260_000 });
    expect(b.budgetableCapacityCents).toBe(0);
    expect(b.discretionary.eligible).toBe(false);
    expect(b.savings.eligible).toBe(false);
    expect(b.bills.eligible).toBe(true);
  });

  it('unknown income → needs_input instead of inventing targets', () => {
    const b = baselineFor({ estimatedMonthlyNetIncomeCents: null, reserveAllocationCents: null });
    expect(b.status).toBe('needs_input');
    expect(b.budgetableCapacityCents).toBeNull();
  });

  it('a revision is versioned and linked to what it replaces', () => {
    const v1 = baselineFor({});
    const v2 = generateBudgetBaseline(profileWith({ essentialMonthlyExpensesCents: 190_000 }), policy, {
      now: NOW,
      previous: v1,
      revisionReason: 'Player confirmed $100 car insurance',
    });
    expect(v2.version).toBe(2);
    expect(v2.supersedesId).toBe(v1.id);
    expect(v2.id).not.toBe(v1.id);
  });
});

describe('PersonalBudget', () => {
  it('is editable and logged, and never touches the baseline', () => {
    const b = baselineFor({});
    const frozen = JSON.stringify(b);
    const pb = updatePersonalBudget(createPersonalBudget(b, NOW), { savingsGoalCents: 2_500 }, NOW);
    expect(pb.savingsGoalCents).toBe(2_500);
    expect(pb.changeLog).toEqual([{ at: NOW, field: 'savingsGoalCents', fromCents: 24_500, toCents: 2_500 }]);
    expect(JSON.stringify(b)).toBe(frozen);
  });
});

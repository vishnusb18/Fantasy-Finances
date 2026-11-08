import type { BudgetPolicy, FinancialProfile } from './types';
import { sum } from './util';

/**
 * Recurring monthly capacity for ADDITIONAL discretionary spending, new savings
 * and optional investing. Null when income or essentials are unknown — we
 * don't guess.
 *
 *   max(0, income − essentials − required debt − held-back reserve)
 */
export function budgetableCapacityCents(p: FinancialProfile): number | null {
  if (p.estimatedMonthlyNetIncomeCents == null || p.essentialMonthlyExpensesCents == null) return null;
  return Math.max(
    0,
    p.estimatedMonthlyNetIncomeCents -
      p.essentialMonthlyExpensesCents -
      (p.requiredMonthlyDebtPaymentsCents ?? 0) -
      (p.reserveAllocationCents ?? 0)
  );
}

/**
 * What is safe to move/spend TODAY — a liquidity check, distinct from what is
 * sustainable over a month.
 *
 *   max(0, checking − unpaid obligations this month − minimum cash floor)
 */
export function safeToMoveNowCents(p: FinancialProfile, policy: BudgetPolicy): number | null {
  if (p.availableCheckingBalanceCents == null) return null;
  const unpaid = sum(p.obligations.filter(o => o.status === 'due' || o.status === 'overdue').map(o => o.amountCents));
  return Math.max(0, p.availableCheckingBalanceCents - unpaid - policy.minCashFloorCents);
}

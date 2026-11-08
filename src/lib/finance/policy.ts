import type { BudgetPolicy } from './types';

/**
 * Illustrative V1 policy. These numbers are a transparent, configurable product
 * choice for the demo — NOT an externally validated financial standard.
 */
export const DEFAULT_POLICY: BudgetPolicy = {
  version: 'policy-2026.11-v1',
  split: { discretionary: 0.5, savings: 0.35, investing: 0.15 },
  reservePct: 0.05,
  reserveFloorCents: 5_000,
  minCashFloorCents: 10_000,
  roundingCents: 500,
  investingMinCapacityCents: 30_000,
  historyMonths: 3,
  weights: { spending: 35, savings: 25, bills: 20, investing: 15, optimization: 5 },
  spendingOverallCapShare: 0.3,
  uncertainCategoryShare: 0.15,
};

export const SCORING_VERSION = 'score-2026.11-v1';

import { budgetableCapacityCents } from './affordability';
import type {
  BudgetPolicy,
  DiscretionaryCategory,
  FinancialProfile,
  PersonalBudget,
  ScoringBaseline,
} from './types';
import { DISCRETIONARY_CATEGORIES } from './types';
import { formatCents, roundDownTo, sum } from './util';

export type BaselineOptions = {
  now?: string;
  /**
   * Optional player preference for how the LOCKED discretionary total is split
   * across categories (relative weights). Applied before locking; it can never
   * change the total.
   */
  categoryPreferences?: Partial<Record<DiscretionaryCategory, number>>;
  /** Set when this baseline replaces an earlier one after a data correction. */
  previous?: ScoringBaseline;
  revisionReason?: string;
};

const emptyCategories = (explanation: string) =>
  Object.fromEntries(
    DISCRETIONARY_CATEGORIES.map(c => [c, { budgetCents: 0, eligible: false, explanation }])
  ) as ScoringBaseline['discretionary']['categories'];

/**
 * Build the authoritative, locked scoring baseline for a month.
 * Personal goals are NOT an input — they cannot weaken the official targets.
 */
export function generateBudgetBaseline(
  profile: FinancialProfile,
  policy: BudgetPolicy,
  opts: BaselineOptions = {}
): ScoringBaseline {
  const version = opts.previous ? opts.previous.version + 1 : 1;
  const capacity = budgetableCapacityCents(profile);
  const assumptions = [
    `Policy ${policy.version}: positive capacity split ${Math.round(policy.split.discretionary * 100)}% discretionary / ${Math.round(policy.split.savings * 100)}% savings / ${Math.round(policy.split.investing * 100)}% investing (illustrative, not financial advice).`,
    `Targets rounded down to the nearest ${formatCents(policy.roundingCents)}; the rounding remainder stays unallocated.`,
    'Essentials are protected and never targeted for cuts.',
    'This baseline is locked for the month. Personal goals do not change it; data corrections create a logged new version.',
  ];
  const hasOverdue = profile.obligations.some(o => o.status === 'overdue');

  const common = {
    id: `${profile.playerId}|${profile.month}|v${version}`,
    playerId: profile.playerId,
    month: profile.month,
    version,
    policyVersion: policy.version,
    lockedAt: opts.now ?? new Date().toISOString(),
    supersedesId: opts.previous?.id,
    revisionReason: opts.revisionReason,
    inputs: {
      estimatedMonthlyNetIncomeCents: profile.estimatedMonthlyNetIncomeCents,
      essentialMonthlyExpensesCents: profile.essentialMonthlyExpensesCents,
      requiredMonthlyDebtPaymentsCents: profile.requiredMonthlyDebtPaymentsCents,
      reserveAllocationCents: profile.reserveAllocationCents,
      sources: profile.sources,
    },
    budgetableCapacityCents: capacity,
    bills: {
      eligible: true,
      explanation: 'Scored on obligations that have actually come due this month. Bills due later are pending, never penalized early.',
    },
    dataQuality: profile.dataQuality,
  };

  if (capacity == null) {
    const why = 'Needs your confirmed monthly income (and essentials) before targets can be set.';
    return {
      ...common,
      status: 'needs_input',
      discretionary: { eligible: false, totalCents: 0, categories: emptyCategories(why), explanation: why },
      savings: { eligible: false, targetCents: 0, explanation: why },
      investing: { eligible: false, targetCents: 0, explanation: why },
      assumptions,
    };
  }

  if (capacity === 0) {
    const why = 'After essentials, required debt payments and the safety buffer there is no room left this month.';
    return {
      ...common,
      status: 'locked',
      discretionary: {
        eligible: false,
        totalCents: 0,
        categories: emptyCategories('No discretionary budget this month.'),
        explanation: `${why} Spending isn't scored; focus on bills. Cautious plan.`,
      },
      savings: { eligible: false, targetCents: 0, explanation: `${why} No savings target — no points lost.` },
      investing: { eligible: false, targetCents: 0, explanation: `${why} Investing isn't appropriate right now.` },
      assumptions,
    };
  }

  // ── Split capacity ──────────────────────────────────────────────────────
  const r = (x: number) => roundDownTo(x, policy.roundingCents);
  const investingEligible =
    profile.hasInvestmentActivity && capacity >= policy.investingMinCapacityCents && !hasOverdue;
  const discretionaryTotal = r(capacity * policy.split.discretionary);
  const investingTarget = investingEligible ? r(capacity * policy.split.investing) : 0;
  const savingsTarget = investingEligible
    ? r(capacity * policy.split.savings)
    : r(capacity * (policy.split.savings + policy.split.investing));

  const investingExplanation = investingEligible
    ? `${Math.round(policy.split.investing * 100)}% of ${formatCents(capacity)} capacity = ${formatCents(investingTarget)} in net new contributions. Market returns never count.`
    : !profile.hasInvestmentActivity
      ? 'No investment account activity found — investing is not scored, and you are not penalized for it. Its share goes to savings.'
      : hasOverdue
        ? 'You have an overdue bill — catching up comes before investing. Investing is not scored; its share goes to savings.'
        : `Capacity (${formatCents(capacity)}) is below the ${formatCents(policy.investingMinCapacityCents)} threshold for an investing target. Its share goes to savings.`;

  // ── Allocate discretionary total across categories ──────────────────────
  const prefs = opts.categoryPreferences;
  const usePrefs = prefs && sum(DISCRETIONARY_CATEGORIES.map(c => Math.max(0, prefs[c] ?? 0))) > 0;
  const weights = DISCRETIONARY_CATEGORIES.map(c =>
    Math.max(0, usePrefs ? (prefs![c] ?? 0) : (profile.categorySpendHistoryCents[c] ?? 0))
  );
  const W = sum(weights);
  const budgets = DISCRETIONARY_CATEGORIES.map((_, i) =>
    W > 0 ? r((discretionaryTotal * weights[i]) / W) : r(discretionaryTotal / DISCRETIONARY_CATEGORIES.length)
  );
  // Rounding remainder goes to the largest category so the parts sum to the total.
  const remainder = discretionaryTotal - sum(budgets);
  if (remainder > 0) {
    const iMax = weights.indexOf(Math.max(...weights));
    budgets[iMax] += remainder;
  }
  const basis = usePrefs ? 'your category preferences' : W > 0 ? 'your recent spending mix' : 'an even split (no history)';
  const categories = Object.fromEntries(
    DISCRETIONARY_CATEGORIES.map((c, i) => [
      c,
      {
        budgetCents: budgets[i],
        eligible: budgets[i] > 0,
        explanation:
          budgets[i] > 0
            ? `${formatCents(budgets[i])} of the ${formatCents(discretionaryTotal)} discretionary total, split by ${basis}.`
            : 'No history in this category, so no separate budget. Any spending here still counts against the overall discretionary cap.',
      },
    ])
  ) as ScoringBaseline['discretionary']['categories'];

  return {
    ...common,
    status: 'locked',
    discretionary: {
      eligible: discretionaryTotal > 0,
      totalCents: discretionaryTotal,
      categories,
      explanation: `${Math.round(policy.split.discretionary * 100)}% of ${formatCents(capacity)} capacity = ${formatCents(discretionaryTotal)} for dining, nightlife, entertainment, shopping and subscriptions.`,
    },
    savings: {
      eligible: savingsTarget > 0,
      targetCents: savingsTarget,
      explanation: `${Math.round((investingEligible ? policy.split.savings : policy.split.savings + policy.split.investing) * 100)}% of ${formatCents(capacity)} capacity = ${formatCents(savingsTarget)} in verified net new savings.`,
    },
    investing: { eligible: investingEligible && investingTarget > 0, targetCents: investingTarget, explanation: investingExplanation },
    assumptions,
  };
}

// ── Personal budget: editable, motivational, never affects scoring ─────────

export function createPersonalBudget(baseline: ScoringBaseline, now?: string): PersonalBudget {
  return {
    playerId: baseline.playerId,
    month: baseline.month,
    baselineId: baseline.id,
    categoryBudgetsCents: Object.fromEntries(
      DISCRETIONARY_CATEGORIES.map(c => [c, baseline.discretionary.categories[c].budgetCents])
    ) as Record<DiscretionaryCategory, number>,
    savingsGoalCents: baseline.savings.targetCents,
    investingGoalCents: baseline.investing.targetCents,
    updatedAt: now ?? new Date().toISOString(),
    changeLog: [],
  };
}

export type PersonalBudgetPatch = {
  categoryBudgetsCents?: Partial<Record<DiscretionaryCategory, number>>;
  savingsGoalCents?: number;
  investingGoalCents?: number;
};

/** Returns a new personal budget. The scoring baseline is untouched by design. */
export function updatePersonalBudget(pb: PersonalBudget, patch: PersonalBudgetPatch, now?: string): PersonalBudget {
  const at = now ?? new Date().toISOString();
  const log = [...pb.changeLog];
  const next: PersonalBudget = { ...pb, categoryBudgetsCents: { ...pb.categoryBudgetsCents }, updatedAt: at };
  for (const [c, v] of Object.entries(patch.categoryBudgetsCents ?? {}) as [DiscretionaryCategory, number][]) {
    const val = Math.max(0, Math.round(v));
    if (val !== next.categoryBudgetsCents[c]) {
      log.push({ at, field: c, fromCents: next.categoryBudgetsCents[c], toCents: val });
      next.categoryBudgetsCents[c] = val;
    }
  }
  for (const field of ['savingsGoalCents', 'investingGoalCents'] as const) {
    const v = patch[field];
    if (v != null && Math.round(v) !== pb[field]) {
      log.push({ at, field, fromCents: pb[field], toCents: Math.max(0, Math.round(v)) });
      next[field] = Math.max(0, Math.round(v));
    }
  }
  next.changeLog = log;
  return next;
}

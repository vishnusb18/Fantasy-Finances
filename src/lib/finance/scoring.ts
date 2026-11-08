import {
  effectiveObligationStatus,
  inPeriod,
  netCategorySpend,
  netInvestmentContributionsCents,
  netNewSavingsCents,
} from "./normalize";
import { DEFAULT_POLICY, SCORING_VERSION } from "./policy";
import type {
  Account,
  BudgetPolicy,
  CategoryScoreLine,
  ComponentKey,
  ComponentScore,
  EfficiencyScoreSnapshot,
  FinancialProfile,
  NormalizedTransaction,
  Obligation,
  ScoringBaseline,
  ScoringPeriod,
} from "./types";
import { DISCRETIONARY_CATEGORIES } from "./types";
import {
  clamp,
  elapsedFraction,
  formatCents,
  monthEnd,
  monthOf,
  round1,
  sum,
} from "./util";

const LABEL: Record<string, string> = {
  dining_out: "Dining out",
  nightlife: "Nightlife",
  entertainment: "Entertainment",
  shopping: "Shopping",
  subscriptions: "Subscriptions",
};
export const categoryLabel = (c: string) =>
  LABEL[c] ?? c.replace(/_/g, " ").replace(/^\w/, (ch) => ch.toUpperCase());

/** 1 at or under budget, falls linearly to 0 at 2× budget. Never above 1. */
export const budgetAdherence = (
  actualCents: number,
  budgetCents: number,
): number =>
  budgetCents > 0
    ? clamp(1 - Math.max(0, actualCents - budgetCents) / budgetCents, 0, 1)
    : actualCents <= 0
      ? 1
      : 0;

const ineligible = (basePoints: number, why: string): ComponentScore => ({
  eligible: false,
  basePoints,
  earned: 0,
  available: 0,
  explanations: [why],
});

export type ScoreInput = {
  profile: FinancialProfile;
  /** Normalized transactions (all months is fine; filtered to the period here). */
  transactions: NormalizedTransaction[];
  obligations: Obligation[];
  accounts: Account[];
  baseline: ScoringBaseline;
  scoringPeriod: ScoringPeriod;
  policy?: BudgetPolicy;
};

/** Deterministic, pure. No LLM decisions; every point has a written reason. */
export function calculateEfficiencyScore(
  input: ScoreInput,
): EfficiencyScoreSnapshot {
  const { transactions, obligations, accounts, baseline, scoringPeriod } =
    input;
  const policy = input.policy ?? DEFAULT_POLICY;
  const W = policy.weights;
  const { month, asOf } = scoringPeriod;
  const awaitingSettlement = transactions.some(
    (t) => t.pending && inPeriod(t, month, asOf),
  );
  const status: "provisional" | "final" =
    asOf > monthEnd(month) && !awaitingSettlement ? "final" : "provisional";
  const elapsed = elapsedFraction(month, asOf);
  const monthTx = transactions.filter((t) => inPeriod(t, month, asOf));
  const pending: string[] = awaitingSettlement
    ? ["Pending records must settle before this period can be finalized."]
    : [];

  // ── Discretionary spending ──────────────────────────────────────────────
  const categoryLines: CategoryScoreLine[] = [];
  let spending: ComponentScore;
  if (!baseline.discretionary.eligible) {
    spending = ineligible(W.spending, baseline.discretionary.explanation);
  } else {
    const actual = netCategorySpend(monthTx);
    const pendingOnly = netCategorySpend(
      monthTx.filter((t) => t.pending),
      { includePending: true },
    );
    const total = baseline.discretionary.totalCents;
    const weights = {
      dining_out: 10,
      nightlife: 5,
      entertainment: 5,
      shopping: 8,
      subscriptions: 7,
    };
    const eligibleWeight = sum(
      DISCRETIONARY_CATEGORIES.filter(
        (c) => baseline.discretionary.categories[c].eligible,
      ).map((c) => weights[c]),
    );
    const explanations: string[] = [];
    let earned = 0;

    for (const c of DISCRETIONARY_CATEGORIES) {
      const line = baseline.discretionary.categories[c];
      const a = actual[c] ?? 0;
      const p = pendingOnly[c] ?? 0;
      const available = line.eligible
        ? (W.spending * weights[c]) / eligibleWeight
        : 0;
      const pts = line.eligible
        ? available * budgetAdherence(a, line.budgetCents)
        : 0;
      earned += pts;
      categoryLines.push({
        category: c,
        budgetCents: line.budgetCents,
        actualCents: a,
        pendingCents: p,
        eligible: line.eligible,
        earned: pts,
        available,
      });
      if (line.eligible && a > line.budgetCents) {
        explanations.push(
          `${categoryLabel(c)} is ${formatCents(a - line.budgetCents)} over its ${formatCents(line.budgetCents)} budget (−${round1(available - pts)} pts).`,
        );
      } else if (
        // Pace hints only once a quarter of the month has passed, and never for
        // fixed monthly charges like subscriptions, where linear projection is wrong.
        line.eligible &&
        c !== "subscriptions" &&
        status === "provisional" &&
        elapsed >= 0.25 &&
        elapsed < 1 &&
        a / elapsed > line.budgetCents * 1.25
      ) {
        explanations.push(
          `${categoryLabel(c)}: ${formatCents(a)} of ${formatCents(line.budgetCents)} used ${Math.round(elapsed * 100)}% into the month — on pace to go over.`,
        );
      }
      if (!line.eligible && a > 0) {
        explanations.push(
          `${categoryLabel(c)} has no separate budget; its ${formatCents(a)} counts toward the overall cap.`,
        );
      }
      if (p > 0)
        pending.push(
          `${formatCents(p)} pending in ${categoryLabel(c)} (projection only; excluded from actual points).`,
        );
    }

    const totalActual = sum(
      DISCRETIONARY_CATEGORIES.map((c) => actual[c] ?? 0),
    );
    const capPoints = W.spending * budgetAdherence(totalActual, total);
    const scale = earned > 0 ? Math.min(1, capPoints / earned) : 0;
    for (const line of categoryLines) line.earned *= scale;
    earned = sum(categoryLines.map((line) => line.earned));
    explanations.unshift(
      `Posted discretionary spending ${formatCents(totalActual)} of ${formatCents(total)}. Category points are limited by the overall cap; pending purchases affect projections only.`,
    );
    spending = {
      eligible: eligibleWeight > 0,
      basePoints: W.spending,
      earned,
      available: eligibleWeight > 0 ? W.spending : 0,
      explanations,
    };
  }

  // ── Savings: verified net new savings vs system target ──────────────────
  let savings: ComponentScore;
  if (!baseline.savings.eligible || baseline.savings.targetCents <= 0) {
    savings = ineligible(W.savings, baseline.savings.explanation);
  } else {
    const net = netNewSavingsCents(monthTx, accounts);
    const ratio = clamp(net / baseline.savings.targetCents, 0, 1);
    const explanations = [
      net < 0
        ? `Net ${formatCents(-net)} moved out of savings this month; no savings points yet.`
        : `Saved ${formatCents(net)} of the ${formatCents(baseline.savings.targetCents)} official target (${Math.round(ratio * 100)}%).`,
    ];
    if (status === "provisional" && ratio < 1)
      explanations.push(
        "Month in progress — savings later this month still count.",
      );
    savings = {
      eligible: true,
      basePoints: W.savings,
      earned: round1(W.savings * ratio),
      available: W.savings,
      explanations,
    };
  }

  // ── Investing: net contributions only, never returns ────────────────────
  let investing: ComponentScore;
  if (!baseline.investing.eligible || baseline.investing.targetCents <= 0) {
    investing = ineligible(W.investing, baseline.investing.explanation);
  } else {
    const net = netInvestmentContributionsCents(monthTx);
    const ratio = clamp(net / baseline.investing.targetCents, 0, 1);
    investing = {
      eligible: true,
      basePoints: W.investing,
      earned: round1(W.investing * ratio),
      available: W.investing,
      explanations: [
        `Contributed ${formatCents(Math.max(0, net))} of the ${formatCents(baseline.investing.targetCents)} investing target (${Math.round(ratio * 100)}%). Market gains are not scored.`,
      ],
    };
  }

  // ── Bills: only what has come due (or been paid) ────────────────────────
  const monthObligations = obligations
    .filter((o) => monthOf(o.dueDate) === month)
    .map((o) => ({ ...o, status: effectiveObligationStatus(o, asOf) }));
  const considered = monthObligations.filter(
    (o) => o.status === "paid" || o.status === "overdue",
  );
  for (const o of monthObligations.filter((o) => o.status === "due")) {
    pending.push(
      `${o.payee} ${formatCents(o.amountCents)} due ${o.dueDate} — not scored until then.`,
    );
  }
  let bills: ComponentScore;
  if (!baseline.bills.eligible || considered.length === 0) {
    bills = ineligible(
      W.bills,
      monthObligations.length
        ? "No bills have come due yet this month — scored once they do."
        : "No bills or debt payments found for this month — not scored, no bonus or penalty.",
    );
  } else {
    const paid = considered.filter((o) => o.status === "paid").length;
    const overdue = considered.filter((o) => o.status === "overdue");
    bills = {
      eligible: true,
      basePoints: W.bills,
      earned: round1((W.bills * paid) / considered.length),
      available: W.bills,
      explanations: [
        `${paid} of ${considered.length} bills that have come due are paid.`,
        ...overdue.map(
          (o) =>
            `${o.payee} (${formatCents(o.amountCents)}) was due ${o.dueDate} and is unpaid.`,
        ),
      ],
    };
  }

  // ── Optimization: excluded in V1 (no verifiable proof rules yet) ────────
  const optimization = ineligible(
    W.optimization,
    "Not scored in this version — no verified fee or subscription savings events yet. Weights renormalized.",
  );

  const components: Record<ComponentKey, ComponentScore> = {
    spending,
    savings,
    bills,
    investing,
    optimization,
  };
  const all = Object.values(components);
  const earnedPoints = sum(all.map((c) => c.earned));
  const availablePoints = round1(sum(all.map((c) => c.available)));
  const skipped = (Object.keys(components) as ComponentKey[]).filter(
    (k) => !components[k].eligible,
  );

  const explanations = [
    ...(status === "provisional"
      ? [
          `Provisional score as of ${asOf} (${Math.round(elapsed * 100)}% through ${month}) — it can still change.`,
        ]
      : []),
    ...(skipped.length
      ? [
          `Not scored this month: ${skipped.join(", ")}. Your percentage uses the ${availablePoints} points that apply to you.`,
        ]
      : []),
    ...spending.explanations,
    ...savings.explanations,
    ...bills.explanations,
    ...(investing.eligible ? investing.explanations : []),
  ];

  return {
    scoringVersion: SCORING_VERSION,
    baselineId: baseline.id,
    playerId: baseline.playerId,
    month,
    asOf,
    status,
    components,
    categoryLines,
    earnedPoints,
    availablePoints,
    efficiencyPct:
      availablePoints > 0
        ? round1((100 * earnedPoints) / availablePoints)
        : null,
    explanations,
    pending,
  };
}

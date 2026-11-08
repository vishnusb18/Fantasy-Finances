import { calculateEfficiencyScore, type ScoreInput } from "../finance/scoring";
import {
  netCategorySpend,
  netNewSavingsCents,
  netInvestmentContributionsCents,
  inPeriod,
} from "../finance/normalize";
import { safeToMoveNowCents } from "../finance/affordability";
import { DEFAULT_POLICY } from "../finance/policy";
import {
  DISCRETIONARY_CATEGORIES,
  type EfficiencyScoreSnapshot,
} from "../finance/types";
import { addMonths, daysInMonth, monthEnd, round1 } from "../finance/util";

export function positions(score: EfficiencyScoreSnapshot) {
  return [
    ...score.categoryLines.map((l) => ({
      key: l.category as string,
      earned: l.earned,
      available: l.available,
      eligible: l.eligible,
      explanation: l.eligible
        ? "Full credit within the official budget; proportional deductions for overspending. Overall cap applies."
        : "Overall cap only; no independently scored budget.",
    })),
    ...(["savings", "investing", "bills"] as const).map((key) => ({
      key,
      ...score.components[key],
      explanation: score.components[key].explanations.join(" "),
    })),
  ];
}

/** History blend for variable expenses; recurring merchant/transfer dates for fixed activity. */
export function projectMonthEndScore(input: ScoreInput) {
  const { month, asOf } = input.scoringPeriod;
  if (asOf > monthEnd(month)) {
    const score = calculateEfficiencyScore(input);
    return {
      score,
      confidence: score.status === "final" ? "Final" : "Awaiting settlement",
      assumptions: [
        "Completed calendar period; actual records only. Pending records must settle before finalization.",
      ],
    };
  }
  const history = input.transactions.filter(
    (t) =>
      !t.pending &&
      t.occurredAt < `${month}-01` &&
      t.occurredAt >= `${addMonths(month, -3)}-01`,
  );
  const historyMonths = new Set(history.map((t) => t.occurredAt.slice(0, 7)))
    .size;
  if (
    historyMonths < 2 ||
    input.profile.dataQuality.includes("income_unverified")
  )
    return {
      score: null,
      confidence: "Insufficient data",
      assumptions: [
        "At least two completed months and verified income are required.",
      ],
    };
  const current = input.transactions.filter((t) => inPeriod(t, month, asOf));
  const tx = current.map((t) => ({ ...t, pending: false }));
  const actual = netCategorySpend(current, { includePending: true });
  const hist = netCategorySpend(history);
  const elapsed = Number(asOf.slice(8));
  for (const c of DISCRETIONARY_CATEGORIES.filter(
    (c) => c !== "subscriptions",
  )) {
    const spent = actual[c] ?? 0;
    const expected = Math.round(
      Math.max(
        spent,
        spent +
          (((hist[c] ?? 0) / historyMonths / daysInMonth(month)) * 0.65 +
            (spent / elapsed) * 0.35) *
            (daysInMonth(month) - elapsed),
      ),
    );
    if (expected > spent)
      tx.push({
        id: `projection-${c}`,
        playerId: input.profile.playerId,
        source: "manual",
        occurredAt: monthEnd(month),
        amountCents: -(expected - spent),
        category: c,
        kind: "expense",
        pending: false,
        confidence: "low",
        categorySource: "rule",
      });
  }
  // Repeat only established monthly patterns, once per merchant/transfer and date.
  const patterns = new Map<string, typeof history>();
  const key = (t: (typeof history)[number]) =>
    `${t.category}:${t.merchantName ?? t.description ?? ""}:${t.occurredAt.slice(8)}`;
  for (const t of history.filter(
    (t) =>
      t.category === "subscriptions" ||
      t.category === "savings_transfer" ||
      t.category === "investment_contribution",
  )) {
    const k = key(t);
    patterns.set(k, [...(patterns.get(k) ?? []), t]);
  }
  for (const [k, matches] of patterns) {
    if (new Set(matches.map((t) => t.occurredAt.slice(0, 7))).size < 2)
      continue;
    const t = matches[matches.length - 1];
    const date = `${month}-${String(Math.min(Number(t.occurredAt.slice(8)), daysInMonth(month))).padStart(2, "0")}`;
    if (date <= asOf || current.some((t) => key(t) === k)) continue;
    tx.push({
      ...t,
      id: `projection-${k}`,
      occurredAt: date,
      amountCents: Math.round(
        matches.reduce((s, t) => s + t.amountCents, 0) / matches.length,
      ),
      pending: false,
    });
  }
  // Future unpaid bills remain unpaid in the conservative estimate; no assumed payments.
  const score = calculateEfficiencyScore({
    ...input,
    transactions: tx,
    scoringPeriod: { month, asOf: `${addMonths(month, 1)}-01` },
  });
  return {
    score,
    confidence: "Estimate · moderate confidence",
    assumptions: [
      "Variable spending: 65% historical daily pattern, 35% current pace, applied to remaining days.",
      "Pending purchases included once. Recurring subscriptions and contributions require two historical occurrences on the same day.",
      "Unpaid future bills remain unpaid in this conservative estimate. No assumed target completion.",
    ],
  };
}

export function calculateFeasiblePotentialScore(
  input: ScoreInput,
  finalScore = calculateEfficiencyScore(input),
) {
  const monthTx = input.transactions.filter((t) =>
    inPeriod(t, input.scoringPeriod.month, input.scoringPeriod.asOf),
  );
  const liquidity = safeToMoveNowCents(
    input.profile,
    input.policy ?? DEFAULT_POLICY,
  );
  // Reserve beyond the minimum cash floor is also held back. No borrowing or assumed income.
  let cash = Math.max(
    0,
    (liquidity ?? 0) - (input.profile.reserveAllocationCents ?? 0),
  );
  const opportunities: {
    category: string;
    amountCents: number;
    points: number;
    explanation: string;
  }[] = [];
  for (const category of ["savings", "investing"] as const) {
    const baseline = input.baseline[category];
    const component = finalScore.components[category];
    if (!baseline.eligible || !component.eligible || baseline.targetCents <= 0)
      continue;
    const progress =
      category === "savings"
        ? netNewSavingsCents(monthTx, input.accounts)
        : netInvestmentContributionsCents(monthTx);
    const amountCents = Math.min(
      cash,
      Math.max(0, baseline.targetCents - Math.max(0, progress)),
    );
    const points = Math.min(
      component.available - component.earned,
      component.available *
        Math.max(
          0,
          Math.min(1, (progress + amountCents) / baseline.targetCents) -
            Math.max(0, progress) / baseline.targetCents,
        ),
    );
    cash -= amountCents;
    if (points > 0)
      opportunities.push({
        category,
        amountCents,
        points,
        explanation:
          "Hypothetical contribution from remaining cash after unpaid obligations, cash floor, and reserve. Savings allocated first.",
      });
  }
  const gain = opportunities.reduce((s, o) => s + o.points, 0);
  return {
    earned: Math.min(
      finalScore.availablePoints,
      finalScore.earnedPoints + gain,
    ),
    efficiency: finalScore.availablePoints
      ? Math.min(
          100,
          ((finalScore.earnedPoints + gain) / finalScore.availablePoints) * 100,
        )
      : null,
    gain,
    opportunities,
    sufficientData: liquidity !== null,
  };
}

export type PublicScore = {
  playerId: string;
  efficiency: number | null;
  earned: number;
  available: number;
  positions: ReturnType<typeof positions>;
};
export const publicScore = (score: EfficiencyScoreSnapshot): PublicScore => ({
  playerId: score.playerId,
  efficiency: score.efficiencyPct,
  earned: score.earnedPoints,
  available: score.availablePoints,
  positions: positions(score).map((p) => ({
    key: p.key,
    earned: p.earned,
    available: p.available,
    eligible: p.eligible,
    explanation: p.eligible
      ? "Normalized competitive performance."
      : "Not scored under the eligibility policy.",
  })),
});
export type Matchup = {
  id: string;
  month: string;
  a: string;
  b: string;
  status: "final" | "active";
  scores: Record<string, PublicScore>;
};
export function winner(match: Matchup) {
  const a = match.scores[match.a]?.efficiency,
    b = match.scores[match.b]?.efficiency;
  if (match.status !== "final" || a == null || b == null) return undefined;
  return a === b ? null : a > b ? match.a : match.b;
}
export function standings(ids: string[], matches: Matchup[]) {
  return ids
    .map((id) => {
      let wins = 0,
        losses = 0,
        ties = 0,
        pointsFor = 0,
        pointsAgainst = 0;
      const outcomes: string[] = [];
      for (const m of [...matches].sort((a, b) =>
        a.month.localeCompare(b.month),
      )) {
        if ((m.a !== id && m.b !== id) || m.status !== "final") continue;
        const result = winner(m);
        if (result === undefined) continue;
        const opponent = m.a === id ? m.b : m.a;
        pointsFor += m.scores[id].efficiency!;
        pointsAgainst += m.scores[opponent].efficiency!;
        if (result === null) {
          ties++;
          outcomes.push("T");
        } else if (result === id) {
          wins++;
          outcomes.push("W");
        } else {
          losses++;
          outcomes.push("L");
        }
      }
      const last = outcomes.at(-1);
      let count = 0;
      for (let i = outcomes.length - 1; i >= 0 && outcomes[i] === last; i--)
        count++;
      return {
        id,
        wins,
        losses,
        ties,
        pointsFor: round1(pointsFor),
        pointsAgainst: round1(pointsAgainst),
        streak: last ? `${count}${last}` : "—",
      };
    })
    .sort(
      (a, b) =>
        b.wins + b.ties / 2 - (a.wins + a.ties / 2) ||
        b.pointsFor - a.pointsFor ||
        a.id.localeCompare(b.id),
    )
    .map((s, i) => ({ ...s, rank: i + 1 }));
}

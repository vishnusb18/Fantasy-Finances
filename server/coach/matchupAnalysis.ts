import type { CoachScenario } from "../../src/lib/coach";
import { round1 } from "../../src/lib/finance/util";
import { positionLabel } from "../../src/app/competitionIdentity";
import { validateScenario } from "./scenarios";

export const COACH_POSITIONS = [
  "dining_out",
  "nightlife",
  "entertainment",
  "shopping",
  "subscriptions",
  "savings",
  "investing",
  "bills",
] as const;
export type CategoryState =
  "scored" | "missing" | "unpublished" | "unscored" | "ineligible" | "invalid";
export type AnalysisCategory = {
  key: string;
  name: string;
  earnedPoints: number;
  maxEligiblePoints: number;
  eligible: boolean;
  state?: CategoryState;
};
export type CategoryEvidence = {
  state: CategoryState;
  earnedPoints: number | null;
  maxEligiblePoints: number | null;
  fraction: number | null;
  trueZero: boolean;
};
export type CategoryGap = {
  key: string;
  name: string;
  user: CategoryEvidence;
  opponent: CategoryEvidence;
  /** Opponent's earned/max rate, weighted by the user's eligible points, less user's earned points. */
  performanceGapPoints: number;
  rawPointGap: number;
  recoverablePoints: number;
};
export type VerifiedNextAction = {
  scenarioId: string;
  categoryKey: string;
  action: CoachScenario["action"];
  amountCents: number;
  rawPointGain: number;
  percentagePointGain: number;
  completesTarget: boolean;
  verification: "existing_scoring_engine";
};
export type VerifiedMatchupAnalysis = {
  verification: "engine_and_published_scores";
  opponentName: string | null;
  comparisonState:
    "comparable" | "opponent_missing" | "no_comparable_positions";
  categories: {
    key: string;
    name: string;
    user: CategoryEvidence;
    opponent: CategoryEvidence;
    recoverablePoints: number;
    lostPoints: number | null;
  }[];
  categoryGaps: CategoryGap[];
  comparableCount: number;
  opponentAllPublishedPositionsMaxed: boolean;
  opponentWeaknesses: {
    key: string;
    name: string;
    earnedPoints: number;
    maxEligiblePoints: number;
  }[];
  recoverablePoints: {
    key: string;
    points: number;
    basis: "independent_verified_scenarios";
  }[];
  feasibleNextActions: VerifiedNextAction[];
  bestNextAction: VerifiedNextAction | null;
  nextActionState:
    | "verified"
    | "historical"
    | "baseline_missing"
    | "financial_info_missing"
    | "no_safe_funds"
    | "no_verified_gain";
  safeAvailableToAllocateCents: number | null;
  upcomingBills: { dueDate: string; state: string }[];
};

function evidence(
  category: AnalysisCategory | undefined,
  absent: "missing" | "unpublished",
): CategoryEvidence {
  if (!category)
    return {
      state: absent,
      earnedPoints: null,
      maxEligiblePoints: null,
      fraction: null,
      trueZero: false,
    };
  const { earnedPoints: earned, maxEligiblePoints: max, eligible } = category;
  const state: CategoryState =
    category.state && category.state !== "scored"
      ? category.state
      : !Number.isFinite(earned) ||
          !Number.isFinite(max) ||
          earned < 0 ||
          max < 0 ||
          earned > max + 0.000001
        ? "invalid"
        : !eligible
          ? "ineligible"
          : max === 0
            ? "unscored"
            : "scored";
  return {
    state,
    earnedPoints: state === "scored" ? earned : null,
    maxEligiblePoints: state === "scored" ? max : null,
    fraction: state === "scored" ? earned / max : null,
    trueZero: state === "scored" && earned === 0,
  };
}

/** Ranks actual category performance gaps and simulator-proven opportunities before Gemini sees them. */
export function buildMatchupAnalysis(input: {
  user: {
    categories: AnalysisCategory[];
    safeAvailableToAllocateCents?: number;
    upcomingBills?: { dueDate: string; state: string }[];
  };
  opponent?: { teamName: string; categories: AnalysisCategory[] };
  scenarios: CoachScenario[];
  active: boolean;
  baselineVerified: boolean;
  ownerScoresFromEngine: boolean;
}): VerifiedMatchupAnalysis {
  for (const s of input.scenarios) validateScenario(s);
  const feasibleNextActions: VerifiedNextAction[] = input.scenarios
    .filter(
      (s) =>
        input.active &&
        input.baselineVerified &&
        s.feasible &&
        (s.category.afterEligible ?? s.category.eligible) &&
        (s.rawEarnedPointDelta ?? 0) > 0 &&
        (s.percentagePointDelta ?? 0) > 0 &&
        (s.projectedPercentagePointDelta === null ||
          s.projectedPercentagePointDelta >= 0),
    )
    .map((s) => ({
      scenarioId: s.id,
      categoryKey: s.category.key,
      action: s.action,
      amountCents: s.amountCents,
      rawPointGain: s.rawEarnedPointDelta!,
      percentagePointGain: s.percentagePointDelta!,
      completesTarget:
        s.category.remainingTargetCents !== null &&
        s.amountCents >= s.category.remainingTargetCents,
      verification: "existing_scoring_engine" as const,
    }))
    .sort(
      (a, b) =>
        b.rawPointGain - a.rawPointGain ||
        a.amountCents - b.amountCents ||
        a.scenarioId.localeCompare(b.scenarioId),
    );
  const categories = COACH_POSITIONS.map((key) => {
    const user = evidence(
      input.user.categories.find((c) => c.key === key),
      input.ownerScoresFromEngine ? "missing" : "unpublished",
    );
    const opponent = evidence(
      input.opponent?.categories.find((c) => c.key === key),
      input.opponent ? "unpublished" : "missing",
    );
    const recoverablePoints =
      user.state === "scored" || user.state === "unscored"
        ? Math.max(
            0,
            ...feasibleNextActions
              .filter((a) => a.categoryKey === key)
              .map((a) => {
                const s = input.scenarios.find((s) => s.id === a.scenarioId)!;
                return round1(
                  Math.max(
                    0,
                    (s.category.afterPoints ?? s.category.beforePoints) -
                      s.category.beforePoints,
                  ),
                );
              }),
          )
        : 0;
    return {
      key,
      name: positionLabel(key),
      user,
      opponent,
      recoverablePoints,
      lostPoints:
        user.state === "scored"
          ? round1(Math.max(0, user.maxEligiblePoints! - user.earnedPoints!))
          : null,
    };
  });
  const comparable = categories.filter(
    (c) => c.user.state === "scored" && c.opponent.state === "scored",
  );
  const categoryGaps: CategoryGap[] = comparable
    .flatMap((c) => {
      const deficit = round1(
        c.opponent.fraction! * c.user.maxEligiblePoints! - c.user.earnedPoints!,
      );
      return deficit > 0
        ? [
            {
              key: c.key,
              name: c.name,
              user: c.user,
              opponent: c.opponent,
              performanceGapPoints: deficit,
              rawPointGap: round1(
                c.opponent.earnedPoints! - c.user.earnedPoints!,
              ),
              recoverablePoints: c.recoverablePoints,
            },
          ]
        : [];
    })
    .sort(
      (a, b) =>
        b.performanceGapPoints - a.performanceGapPoints ||
        a.key.localeCompare(b.key),
    );
  const published = categories.filter((c) => c.opponent.state === "scored");
  const opponentWeaknesses = published
    .filter(
      (c) =>
        round1(c.opponent.fraction! * 100) < 100 &&
        round1(c.opponent.maxEligiblePoints! - c.opponent.earnedPoints!) > 0,
    )
    .sort(
      (a, b) =>
        b.opponent.maxEligiblePoints! -
          b.opponent.earnedPoints! -
          (a.opponent.maxEligiblePoints! - a.opponent.earnedPoints!) ||
        a.key.localeCompare(b.key),
    )
    .map((c) => ({
      key: c.key,
      name: c.name,
      earnedPoints: c.opponent.earnedPoints!,
      maxEligiblePoints: c.opponent.maxEligiblePoints!,
    }));
  const cash = input.user.safeAvailableToAllocateCents;
  const safeAvailable =
    cash !== undefined && Number.isSafeInteger(cash) && cash >= 0 ? cash : null;
  return {
    verification: "engine_and_published_scores",
    opponentName: input.opponent?.teamName ?? null,
    comparisonState: !input.opponent
      ? "opponent_missing"
      : comparable.length
        ? "comparable"
        : "no_comparable_positions",
    categories,
    categoryGaps,
    comparableCount: comparable.length,
    opponentAllPublishedPositionsMaxed:
      published.length > 0 && published.every((c) => c.opponent.fraction === 1),
    opponentWeaknesses,
    recoverablePoints: categories.map((c) => ({
      key: c.key,
      points: c.recoverablePoints,
      basis: "independent_verified_scenarios",
    })),
    feasibleNextActions,
    bestNextAction: feasibleNextActions[0] ?? null,
    nextActionState: feasibleNextActions.length
      ? "verified"
      : !input.active
        ? "historical"
        : !input.baselineVerified
          ? "baseline_missing"
          : safeAvailable === null ||
              input.user.upcomingBills?.some((b) => b.state === "unknown")
            ? "financial_info_missing"
            : safeAvailable === 0
              ? "no_safe_funds"
              : "no_verified_gain",
    safeAvailableToAllocateCents: safeAvailable,
    upcomingBills: input.user.upcomingBills ?? [],
  };
}

export function isMatchupStrategyQuestion(question: string): boolean {
  return /\b(?:opponent|matchup|beat|win|strongest|weakest|falling behind|next move|best move|highest.impact|catch up|strategy)\b/i.test(
    question,
  );
}

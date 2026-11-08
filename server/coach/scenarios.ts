import type { CoachScenario, CoachScore } from "../../src/lib/coach";
import type { EfficiencyScoreSnapshot } from "../../src/lib/finance/types";
import type { MovePreview } from "../../src/lib/competition/moves";
import { round1 } from "../../src/lib/finance/util";

export const coachScore = (score: EfficiencyScoreSnapshot): CoachScore => ({
  efficiencyPercent: score.efficiencyPct,
  earnedPoints: score.earnedPoints,
  eligiblePoints: score.availablePoints,
});
export const scoreDelta = (before: number | null, after: number | null) =>
  before === null || after === null ? null : round1(after - before);

export function verifiedScenario(
  id: string,
  action: CoachScenario["action"],
  preview: MovePreview,
  remainingTargetCents: number | null,
): CoachScenario {
  const p = preview.beforePosition!;
  const scenario: CoachScenario = {
    id,
    action,
    amountCents: preview.amountCents,
    feasible: true,
    status: "hypothetical",
    verification: "existing_scoring_engine",
    current: coachScore(preview.before.score),
    baselineForecast: preview.projectedBefore
      ? coachScore(preview.projectedBefore)
      : null,
    hypotheticalCurrent: coachScore(preview.after.score),
    hypotheticalForecast: preview.projectedAfter
      ? coachScore(preview.projectedAfter)
      : null,
    rawEarnedPointDelta: preview.rawPointDelta,
    percentagePointDelta: preview.percentagePointDelta,
    projectedRawPointDelta:
      preview.projectedBefore && preview.projectedAfter
        ? scoreDelta(
            preview.projectedBefore.earnedPoints,
            preview.projectedAfter.earnedPoints,
          )
        : null,
    projectedPercentagePointDelta: scoreDelta(
      preview.projectedBefore?.efficiencyPct ?? null,
      preview.projectedAfter?.efficiencyPct ?? null,
    ),
    category: {
      key: preview.affected,
      eligible: p.eligible,
      beforePoints: p.earned,
      afterPoints: preview.afterPosition?.earned ?? null,
      afterEligible: preview.afterPosition?.eligible ?? false,
      afterAvailablePoints: preview.afterPosition?.available ?? 0,
      availablePoints: p.available,
      remainingCapacityPoints: round1(Math.max(0, p.available - p.earned)),
      remainingTargetCents,
    },
  };
  validateScenario(scenario);
  return scenario;
}

/** Reject impossible or mismatched metrics before any numbers reach Gemini or the UI. */
export function validateScenario(s: CoachScenario): void {
  if (
    s.verification !== "existing_scoring_engine" ||
    s.status !== (s.feasible ? "hypothetical" : "unavailable")
  )
    throw new Error("Unverified scenario status");
  const c = s.category;
  // Paying a newly due bill can activate the existing engine's previously unscored bills component.
  const activatesBills =
    s.action === "pay_due_bill" && !c.eligible && c.afterEligible === true;
  if (
    ![c.beforePoints, c.availablePoints, c.remainingCapacityPoints].every(
      Number.isFinite,
    ) ||
    c.beforePoints < 0 ||
    c.availablePoints < 0 ||
    c.beforePoints > c.availablePoints + 0.000001 ||
    c.remainingCapacityPoints !==
      round1(Math.max(0, c.availablePoints - c.beforePoints)) ||
    (c.afterPoints !== null &&
      (!Number.isFinite(c.afterPoints) ||
        c.afterPoints < 0 ||
        c.afterPoints >
          (c.afterAvailablePoints ?? c.availablePoints) + 0.000001)) ||
    (c.afterAvailablePoints !== undefined &&
      (!Number.isFinite(c.afterAvailablePoints) ||
        c.afterAvailablePoints < 0 ||
        (!activatesBills && c.afterAvailablePoints !== c.availablePoints)))
  )
    throw new Error("Invalid scenario category");
  if (
    !Number.isSafeInteger(s.amountCents) ||
    s.amountCents <= 0 ||
    (s.category.remainingTargetCents !== null &&
      (!Number.isSafeInteger(s.category.remainingTargetCents) ||
        s.category.remainingTargetCents < 0))
  )
    throw new Error("Invalid scenario money");
  for (const score of [
    s.current,
    s.baselineForecast,
    s.hypotheticalCurrent,
    s.hypotheticalForecast,
  ]) {
    if (!score) continue;
    if (
      ![score.earnedPoints, score.eligiblePoints].every(Number.isFinite) ||
      score.eligiblePoints < 0 ||
      score.earnedPoints < 0 ||
      score.earnedPoints > score.eligiblePoints + 0.000001 ||
      (score.efficiencyPercent !== null &&
        (!Number.isFinite(score.efficiencyPercent) ||
          score.efficiencyPercent < 0 ||
          score.efficiencyPercent > 100))
    )
      throw new Error("Invalid scenario score");
  }
  if (s.feasible) {
    if (
      !s.hypotheticalCurrent ||
      Boolean(s.baselineForecast) !== Boolean(s.hypotheticalForecast) ||
      (s.baselineForecast &&
        s.hypotheticalForecast &&
        s.baselineForecast.eligiblePoints !==
          s.hypotheticalForecast.eligiblePoints) ||
      (!activatesBills &&
        s.current.eligiblePoints !== s.hypotheticalCurrent.eligiblePoints) ||
      s.percentagePointDelta !==
        scoreDelta(
          s.current.efficiencyPercent,
          s.hypotheticalCurrent.efficiencyPercent,
        ) ||
      s.rawEarnedPointDelta !==
        scoreDelta(
          s.current.earnedPoints,
          s.hypotheticalCurrent.earnedPoints,
        ) ||
      s.projectedPercentagePointDelta !==
        scoreDelta(
          s.baselineForecast?.efficiencyPercent ?? null,
          s.hypotheticalForecast?.efficiencyPercent ?? null,
        ) ||
      s.projectedRawPointDelta !==
        (s.baselineForecast && s.hypotheticalForecast
          ? scoreDelta(
              s.baselineForecast.earnedPoints,
              s.hypotheticalForecast.earnedPoints,
            )
          : null)
    )
      throw new Error("Scenario comparisons do not match engine snapshots");
    if (
      !activatesBills &&
      (!s.category.eligible || s.category.remainingCapacityPoints === 0) &&
      s.category.afterPoints !== s.category.beforePoints
    )
      throw new Error("Ineligible or capped category gained points");
  } else if (
    s.hypotheticalCurrent !== null ||
    s.hypotheticalForecast !== null ||
    s.rawEarnedPointDelta !== null ||
    s.percentagePointDelta !== null ||
    s.projectedRawPointDelta !== null ||
    s.projectedPercentagePointDelta !== null
  ) {
    throw new Error("Unverified hypothetical score");
  }
}

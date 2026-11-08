import type { CoachMatchupContext } from "./buildMatchupContext";
import type { CoachScenario } from "../../src/lib/coach";
import {
  formatCents,
  formatEfficiency,
  formatScoreValue,
  round1,
} from "../../src/lib/finance/util";
import { positionLabel } from "../../src/app/competitionIdentity";
import { validateScenario } from "./scenarios";
import { strategyCatalog, nextActionText } from "./matchupStrategy";

export type VerifiedFact = {
  id: string;
  text: string;
  kind: "explanation" | "recommendation";
  section?: "gaps" | "strengths" | "action";
};
export type ExplanationCatalog = {
  mode?: "strategy";
  mandatory: string[];
  facts: VerifiedFact[];
};
const REDIRECT: VerifiedFact = {
  id: "coach.redirect",
  text: "My specialty is financial performance and matchup strategy. Ask me about your monthly results or your next money move!",
  kind: "explanation",
};
const points = formatScoreValue;
const delta = (value: number | null, unit: string) =>
  value === null
    ? "unavailable"
    : `${value > 0 ? "+" : ""}${points(value)} ${unit}`;
const verb = (s: CoachScenario) =>
  s.action === "save"
    ? "Saving"
    : s.action === "invest"
      ? "Investing"
      : "Paying the due bill of";

/** Model selects and orders verified financial statements; it cannot author numbers or change their labels. */
export function explanationCatalog(
  context: CoachMatchupContext,
): ExplanationCatalog {
  if (context.responseKind === "strategy") {
    const catalog = strategyCatalog(context.analysis);
    return { ...catalog, facts: [...catalog.facts, REDIRECT] };
  }
  const facts: VerifiedFact[] = [REDIRECT],
    mandatory: string[] = [];
  const add = (
    id: string,
    text: string,
    kind: VerifiedFact["kind"] = "explanation",
  ) => {
    facts.push({ id, text, kind });
    return id;
  };
  const requested = context.scenarios.find(
    (s) => s.id === context.requestedScenarioId,
  );
  for (const s of context.scenarios) validateScenario(s);
  if (requested) {
    const s = requested;
    mandatory.push(
      add(
        "scenario.answer",
        !s.feasible
          ? `${verb(s)} ${formatCents(s.amountCents)} cannot be verified as a feasible scoring move: ${s.reason}`
          : s.rawEarnedPointDelta === 0 && s.percentagePointDelta === 0
            ? `${verb(s)} ${formatCents(s.amountCents)} adds no points: current efficiency stays ${formatEfficiency(s.current.efficiencyPercent)} (${points(s.current.earnedPoints)} / ${points(s.current.eligiblePoints)} eligible points; ${delta(s.rawEarnedPointDelta, "points")}, ${delta(s.percentagePointDelta, "percentage points")}).`
            : `${verb(s)} ${formatCents(s.amountCents)} would ${s.percentagePointDelta === null ? "change" : s.percentagePointDelta > 0 ? "raise" : s.percentagePointDelta < 0 ? "lower" : "leave unchanged"} current efficiency from ${formatEfficiency(s.current.efficiencyPercent)} to ${formatEfficiency(s.hypotheticalCurrent!.efficiencyPercent)} (${delta(s.percentagePointDelta, "percentage points")}); earned points ${points(s.current.earnedPoints)} → ${points(s.hypotheticalCurrent!.earnedPoints)} / ${points(s.current.eligiblePoints)} (${delta(s.rawEarnedPointDelta, "points")}).`,
      ),
    );
    if (s.feasible) {
      mandatory.push(
        add(
          "scenario.forecast",
          s.baselineForecast && s.hypotheticalForecast
            ? `Month-end forecast: baseline ${formatEfficiency(s.baselineForecast.efficiencyPercent)} → hypothetical ${formatEfficiency(s.hypotheticalForecast.efficiencyPercent)} (${delta(s.projectedPercentagePointDelta, "percentage points")}; ${delta(s.projectedRawPointDelta, "forecast points")}). Forecasts include future activity and are separate from current efficiency.`
            : "A verified month-end forecast is unavailable; no projected gain is assumed.",
        ),
      );
      const c = s.category;
      mandatory.push(
        add(
          "scenario.reason",
          !c.eligible
            ? `${positionLabel(c.key)} is not eligible for scoring; contributions cannot earn category points.`
            : `${positionLabel(c.key)}: ${points(c.beforePoints)} → ${points(c.afterPoints!)} / ${points(c.availablePoints)} points. ${c.remainingCapacityPoints === 0 ? "Already maxed out; additional contributions cannot earn extra category points." : `${points(c.remainingCapacityPoints)} points of capacity remained before this preview.`} Official points stay unchanged until the action happens.`,
        ),
      );
    }
  } else {
    mandatory.push(
      add(
        "current",
        context.current
          ? `Current ${context.status === "finalized" ? "finalized" : "provisional"} efficiency: ${formatEfficiency(context.current.efficiencyPercent)} (${points(context.current.earnedPoints)} / ${points(context.current.eligiblePoints)} eligible points).`
          : "The official current score is unavailable for this month; no replacement score is assumed.",
      ),
    );
    add(
      "baseline.forecast",
      context.baselineForecast
        ? `Baseline month-end forecast: ${formatEfficiency(context.baselineForecast.efficiencyPercent)}. This is an estimate of future activity, separate from current efficiency.`
        : "There is not enough verified data for a baseline month-end forecast.",
    );
    if (context.requestedAction)
      mandatory.push(
        add(
          "scenario.missing",
          context.requestedScenarioId
            ? "An exact scenario is unavailable for this month. No hypothetical score or gain is assumed."
            : "Specify a dollar amount for an exact contribution preview; no amount is assumed for your question.",
        ),
      );
  }
  const ownerCategories = context.user.categories.filter(
    (c) => c.eligible && c.maxEligiblePoints > 0,
  );
  for (const c of ownerCategories)
    add(
      `owner.${c.key}`,
      `Current ${c.name}: ${points(c.earnedPoints)} / ${points(c.maxEligiblePoints)} points (${formatEfficiency(c.efficiencyPercent)}). Verified moves can currently add ${points(context.analysis.recoverablePoints.find((p) => p.key === c.key)?.points ?? 0)} category points.`,
    );
  if (context.opponent) {
    const opp = context.opponent;
    add(
      "opponent.current",
      `${opp.teamName}'s published current efficiency is ${formatEfficiency(opp.efficiencyPercent)} (${points(opp.earnedPoints)} / ${points(opp.eligiblePoints)} eligible points). `,
    );
    const categories = opp.categories
      .filter(
        (c) =>
          c.eligible &&
          c.maxEligiblePoints > 0 &&
          Number.isFinite(c.earnedPoints) &&
          c.earnedPoints >= 0 &&
          c.earnedPoints <= c.maxEligiblePoints,
      )
      .sort(
        (a, b) =>
          a.earnedPoints / a.maxEligiblePoints -
          b.earnedPoints / b.maxEligiblePoints,
      );
    const weak = categories
      .filter(
        (c) =>
          c.earnedPoints < c.maxEligiblePoints &&
          round1((c.earnedPoints / c.maxEligiblePoints) * 100) < 100 &&
          round1(c.maxEligiblePoints - c.earnedPoints) > 0,
      )
      .sort(
        (a, b) =>
          b.maxEligiblePoints -
          b.earnedPoints -
          (a.maxEligiblePoints - a.earnedPoints),
      )[0];
    const strong = categories.at(-1);
    for (const [label, c] of [
      ["weakest", weak],
      ["strongest", strong],
    ] as const)
      if (c) {
        const own = ownerCategories.find((o) => o.key === c.key);
        add(
          `opponent.${label}`,
          `${opp.teamName}'s ${label} published position is ${c.name}: ${formatEfficiency(c.efficiencyPercent)} (${points(c.earnedPoints)}/${points(c.maxEligiblePoints)} points).${own ? ` You're at ${points(own.earnedPoints)}/${points(own.maxEligiblePoints)} in that position.` : ""}`,
        );
      }
    if (!weak && categories.length)
      add(
        "opponent.maxed",
        `${opp.teamName}'s published scored positions are all maxed out; there isn't a weak position among them.`,
      );
  }
  // Each option is independently feasible. Never imply these amounts can all be allocated together.
  const alternatives = context.scenarios
    .filter(
      (s) =>
        s.feasible &&
        s.category.eligible &&
        (s.percentagePointDelta ?? 0) > 0 &&
        (s.projectedPercentagePointDelta === null ||
          s.projectedPercentagePointDelta >= 0) &&
        s.id !== context.requestedScenarioId,
    )
    .sort(
      (a, b) => (b.percentagePointDelta ?? 0) - (a.percentagePointDelta ?? 0),
    );
  for (const [i, s] of alternatives.entries())
    add(
      `alternative.${i}`,
      `One feasible alternative, considered on its own: ${verb(s).toLowerCase()} ${formatCents(s.amountCents)} gives ${delta(s.rawEarnedPointDelta, "points")} and ${delta(s.percentagePointDelta, "current percentage points")}. The engine checks unpaid obligations, safety reserve and cash floor; only do this if it fits your financial plan.`,
      "recommendation",
    );
  if (!alternatives.length)
    add("action.none", nextActionText(context.analysis), "recommendation");
  if (context.limitation) add("limitation", context.limitation);
  return { facts, mandatory };
}

export const explanationSchema = (catalog: ExplanationCatalog) => ({
  type: "object",
  additionalProperties: false,
  required: ["explanationIds", "recommendationIds"],
  properties: {
    explanationIds: {
      type: "array",
      minItems: 0,
      maxItems: catalog.mode === "strategy" ? 2 : 4,
      items: {
        type: "string",
        enum: catalog.facts
          .filter((f) => f.kind === "explanation")
          .map((f) => f.id),
      },
    },
    recommendationIds: {
      type: "array",
      minItems: 0,
      maxItems: 1,
      items: {
        type: "string",
        enum: catalog.facts
          .filter((f) => f.kind === "recommendation")
          .map((f) => f.id),
      },
    },
  },
});

export function renderVerifiedExplanation(
  payload: unknown,
  catalog: ExplanationCatalog,
): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new Error("Invalid explanation plan");
  const plan = payload as Record<string, unknown>;
  if (
    Object.keys(plan).some(
      (k) => k !== "explanationIds" && k !== "recommendationIds",
    )
  )
    throw new Error("Unverified explanation fields");
  const ids: string[] = [];
  for (const [key, kind, limit] of [
    ["explanationIds", "explanation", catalog.mode === "strategy" ? 2 : 4],
    ["recommendationIds", "recommendation", 1],
  ] as const) {
    const value = plan[key];
    if (
      !Array.isArray(value) ||
      value.length > limit ||
      value.some(
        (id) =>
          typeof id !== "string" ||
          !catalog.facts.some((f) => f.id === id && f.kind === kind),
      )
    )
      throw new Error("Unverified explanation reference");
    ids.push(...value);
  }
  if (ids.includes(REDIRECT.id)) {
    if (ids.length !== 1)
      throw new Error("Redirect must not include financial claims");
    return REDIRECT.text;
  }
  if (catalog.mode === "strategy") {
    const selected = ids.map((id) => catalog.facts.find((f) => f.id === id)!);
    if (
      selected.length !== 3 ||
      ["gaps", "strengths", "action"].some(
        (section) => selected.filter((f) => f.section === section).length !== 1,
      )
    )
      throw new Error("Unverified strategy structure");
    const text = ["gaps", "strengths", "action"]
      .map((section) => selected.find((f) => f.section === section)!.text)
      .join("\n\n");
    if (text.split(/\s+/).length > 110)
      throw new Error("Strategy exceeded concise word budget");
    return text;
  }
  // Required direct answer, paired comparison and category cap cannot be omitted or relabeled by the model.
  return [...new Set([...catalog.mandatory, ...ids])]
    .map((id) => catalog.facts.find((f) => f.id === id)!.text)
    .join("\n\n");
}

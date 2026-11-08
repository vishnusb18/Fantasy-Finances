import type { LeagueSession, PublicLeagueScore } from "../leagueSession";
import type { ProviderData } from "../../src/lib/finance/types";
import { runFinancePipeline } from "../../src/lib/finance/pipeline";
import {
  positions,
  projectMonthEndScore,
} from "../../src/lib/competition/engine";
import {
  simulateMove,
  type MoveInput,
  type Move,
} from "../../src/lib/competition/moves";
import { safeToMoveNowCents } from "../../src/lib/finance/affordability";
import { DEFAULT_POLICY } from "../../src/lib/finance/policy";
import {
  netNewSavingsCents,
  netInvestmentContributionsCents,
  inPeriod,
} from "../../src/lib/finance/normalize";
import { previousMonths, monthEnd, round1 } from "../../src/lib/finance/util";
import { MEMBERS } from "../../src/lib/competition/demo";
import { monthPairings } from "../../src/lib/competition/pairings";
import { positionLabel } from "../../src/app/competitionIdentity";
import { calculateEfficiencyScore } from "../../src/lib/finance/scoring";
import type { CoachScenario } from "../../src/lib/coach";
import { coachScore, verifiedScenario, validateScenario } from "./scenarios";
import {
  buildMatchupAnalysis,
  isMatchupStrategyQuestion,
  type CategoryState,
} from "./matchupAnalysis";

const latest = (scores: PublicLeagueScore[], player: string, month: string) =>
  scores
    .filter((s) => s.playerKey === player && s.month === month)
    .sort((a, b) => (BigInt(a.updatedAt) > BigInt(b.updatedAt) ? -1 : 1))[0];
const publicView = (score: PublicLeagueScore) => ({
  efficiencyPercent: score.efficiencyPct,
  earnedPoints: score.earnedPoints,
  eligiblePoints: score.availablePoints,
  categories: score.categories
    .filter((c) =>
      [
        "dining_out",
        "nightlife",
        "entertainment",
        "shopping",
        "subscriptions",
        "savings",
        "investing",
        "bills",
      ].includes(c.category),
    )
    .slice(0, 8)
    .map((c) => ({
      key: c.category,
      name: positionLabel(c.category),
      earnedPoints: c.earned,
      maxEligiblePoints: c.available,
      eligible: c.eligible,
      efficiencyPercent:
        c.eligible && c.available > 0
          ? round1((c.earned / c.available) * 100)
          : null,
    })),
});
/** Explicit allowlists are the privacy boundary: no opponent bank data is fetched or forwarded. */
export function buildMatchupContext(
  session: LeagueSession,
  data: ProviderData,
  month: string,
  now: string,
  question: string,
) {
  if (data.playerId !== session.playerKey)
    throw new Error("Owner context mismatch");
  const active = month === now.slice(0, 7);
  const baseline =
    session.baseline?.month === month &&
    session.baseline.playerId === session.playerKey &&
    session.baseline.status === "locked"
      ? session.baseline
      : undefined;
  const ownPublic = latest(session.scores, session.playerKey, month);
  const asOf = active ? now : monthEnd(month);
  const result = baseline
    ? runFinancePipeline({
        data,
        asOf,
        lockedBaseline: baseline,
        confirmations: session.confirmations,
        overrides: session.overrides,
      })
    : undefined;
  if (result && !active)
    result.score = calculateEfficiencyScore({
      profile: result.profile,
      baseline: baseline!,
      transactions: result.transactions,
      accounts: data.accounts,
      obligations: data.obligations,
      scoringPeriod: { month, asOf: now },
      policy: DEFAULT_POLICY,
    });
  const liquid = result
    ? safeToMoveNowCents(result.profile, DEFAULT_POLICY)
    : null;
  const user = {
    teamName: session.displayName,
    ...(result
      ? {
          efficiencyPercent: result.score.efficiencyPct,
          earnedPoints: result.score.earnedPoints,
          eligiblePoints: result.score.availablePoints,
          categories: positions(result.score).map((p) => ({
            key: p.key,
            name: positionLabel(p.key),
            earnedPoints: p.earned,
            maxEligiblePoints: p.available,
            eligible: p.eligible,
            efficiencyPercent:
              p.eligible && p.available > 0
                ? round1((p.earned / p.available) * 100)
                : null,
          })),
        }
      : ownPublic
        ? publicView(ownPublic)
        : { efficiencyPercent: null, categories: [] }),
    ...(result && active
      ? {
          ...(liquid === null
            ? {}
            : {
                safeAvailableToAllocateCents: Math.max(
                  0,
                  liquid - (result.profile.reserveAllocationCents ?? 0),
                ),
              }),
          upcomingBills: result.profile.obligations
            .filter((o) => o.status !== "paid")
            .map((o) => ({ dueDate: o.dueDate, state: o.status })),
          savingsTargetRemainingCents: baseline!.savings.eligible
            ? Math.max(
                0,
                baseline!.savings.targetCents -
                  Math.max(
                    0,
                    netNewSavingsCents(
                      result.transactions.filter((t) =>
                        inPeriod(t, month, asOf),
                      ),
                      data.accounts,
                    ),
                  ),
              )
            : null,
          investingTargetRemainingCents: baseline!.investing.eligible
            ? Math.max(
                0,
                baseline!.investing.targetCents -
                  Math.max(
                    0,
                    netInvestmentContributionsCents(
                      result.transactions.filter((t) =>
                        inPeriod(t, month, asOf),
                      ),
                    ),
                  ),
              )
            : null,
        }
      : {}),
  };
  const publicPlayers = MEMBERS.flatMap((m) =>
    session.players.filter(
      (p) =>
        p.source === "nessie" &&
        p.displayName === `${m.firstName} ${m.lastName}`,
    ),
  );
  const monthIndex = [
    ...previousMonths(now.slice(0, 7), 3),
    now.slice(0, 7),
  ].indexOf(month);
  const pair = monthPairings(
    publicPlayers.map((p) => p.playerKey),
    monthIndex,
  ).find((pair) => pair.includes(session.playerKey));
  const opponentId = pair?.find((id) => id !== session.playerKey);
  const opponentScore = opponentId
    ? latest(session.scores, opponentId, month)
    : undefined;
  const opponent = opponentScore
    ? {
        teamName: publicPlayers.find((p) => p.playerKey === opponentId)!
          .displayName,
        ...publicView(opponentScore),
      }
    : undefined;
  const forecast =
    result && active
      ? projectMonthEndScore({
          profile: result.profile,
          baseline: baseline!,
          transactions: result.transactions,
          accounts: data.accounts,
          obligations: data.obligations,
          scoringPeriod: { month, asOf },
          policy: DEFAULT_POLICY,
        })
      : null;
  const scenarios: CoachScenario[] = [];
  const requestedAction = /\b(?:save|saving|savings)\b/i.test(question)
    ? "save"
    : /\b(?:invest|investing|investment)\b/i.test(question)
      ? "invest"
      : null;
  const amount = requestedAction
    ? question.match(
        /\$\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)(?![\d.])|\b(?:save|invest)(?:\s+another)?\s+(\d+(?:\.\d{1,2})?)(?![\d.])/i,
      )
    : null;
  const requestedCents = amount
    ? Math.round(Number((amount[1] ?? amount[2]).replace(/,/g, "")) * 100)
    : null;
  const requestedScenarioId =
    requestedAction && requestedCents !== null
      ? `${requestedAction}:${requestedCents}`
      : null;
  if (result && baseline && active) {
    const input: MoveInput = {
      data,
      asOf,
      lockedBaseline: baseline,
      confirmations: session.confirmations,
      overrides: session.overrides,
    };
    const evaluate = (
      move: Move,
      id: string,
      action: CoachScenario["action"],
      remainingTargetCents: number | null,
    ) => {
      let preview;
      try {
        preview = simulateMove(input, move);
      } catch (e) {
        const categoryKey =
          action === "save"
            ? "savings"
            : action === "invest"
              ? "investing"
              : "bills";
        const category = positions(result.score).find(
          (p) => p.key === categoryKey,
        )!;
        const scenario: CoachScenario = {
          id,
          action,
          amountCents:
            move.kind === "bill"
              ? data.obligations.find((o) => o.id === move.billId)!.amountCents
              : move.amountCents,
          feasible: false,
          status: "unavailable",
          verification: "existing_scoring_engine",
          current: coachScore(result.score),
          baselineForecast: forecast?.score ? coachScore(forecast.score) : null,
          hypotheticalCurrent: null,
          hypotheticalForecast: null,
          rawEarnedPointDelta: null,
          percentagePointDelta: null,
          projectedRawPointDelta: null,
          projectedPercentagePointDelta: null,
          category: {
            key: categoryKey,
            eligible: category.eligible,
            beforePoints: category.earned,
            afterPoints: null,
            availablePoints: category.available,
            remainingCapacityPoints: round1(
              Math.max(0, category.available - category.earned),
            ),
            remainingTargetCents,
          },
          reason:
            e instanceof Error
              ? e.message
              : "The scoring engine could not verify this scenario.",
        };
        validateScenario(scenario);
        scenarios.push(scenario);
        return;
      }
      scenarios.push(
        verifiedScenario(id, action, preview, remainingTargetCents),
      );
    };
    for (const kind of ["save", "invest"] as const) {
      const remaining =
        kind === "save"
          ? user.savingsTargetRemainingCents
          : user.investingTargetRemainingCents;
      const amounts = new Set([
        requestedCents ?? 2500,
        Math.min(user.safeAvailableToAllocateCents ?? 0, remaining ?? 0),
      ]);
      for (const amountCents of amounts) {
        if (!Number.isSafeInteger(amountCents) || amountCents <= 0) continue;
        evaluate(
          { kind, amountCents },
          `${kind}:${amountCents}`,
          kind,
          remaining ?? null,
        );
      }
    }
    for (const [index, bill] of data.obligations
      .filter(
        (o) =>
          o.status !== "paid" &&
          o.dueDate.startsWith(month) &&
          o.dueDate <= asOf,
      )
      .slice(0, 3)
      .entries()) {
      evaluate(
        { kind: "bill", billId: bill.id },
        `bill:${index}`,
        "pay_due_bill",
        null,
      );
    }
  }
  const analysis = buildMatchupAnalysis({
    user: {
      ...user,
      categories: user.categories.map((c) => ({
        ...c,
        ...(result
          ? {
              state: (c.eligible
                ? "scored"
                : ["savings", "investing", "bills"].includes(c.key) &&
                    baseline![c.key as "savings" | "investing" | "bills"]
                      .eligible
                  ? "unscored"
                  : "ineligible") as CategoryState,
            }
          : {}),
      })),
    },
    opponent,
    scenarios,
    active,
    baselineVerified: !!baseline,
    ownerScoresFromEngine: !!result,
  });
  return {
    responseKind: requestedScenarioId
      ? ("scenario" as const)
      : isMatchupStrategyQuestion(question)
        ? ("strategy" as const)
        : ("score" as const),
    analysis,
    month,
    now,
    currency: "USD",
    monetaryUnit: "integer_cents",
    status:
      (result?.score.status ?? ownPublic?.status) === "final"
        ? "finalized"
        : "provisional",
    user,
    opponent,
    ...(opponent
      ? {}
      : {
          opponentUnavailable:
            "No verified public opponent snapshot for this month.",
        }),
    current: result
      ? coachScore(result.score)
      : ownPublic
        ? {
            efficiencyPercent: ownPublic.efficiencyPct,
            earnedPoints: ownPublic.earnedPoints,
            eligiblePoints: ownPublic.availablePoints,
          }
        : null,
    baselineForecast: forecast?.score ? coachScore(forecast.score) : null,
    forecastAssumptions: forecast?.assumptions ?? [],
    requestedAction,
    requestedScenarioId,
    scenarios,
    ...(!baseline
      ? {
          limitation:
            "The official locked baseline is unavailable for this month. Exact private what-if calculations are unavailable.",
        }
      : {}),
    ...(!active
      ? {
          limitation:
            "Historical period: no new contribution scenarios. Unsettled records retain their pending state.",
        }
      : {}),
  };
}
export type CoachMatchupContext = ReturnType<typeof buildMatchupContext>;

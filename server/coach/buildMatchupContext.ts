import type { LeagueSession, PublicLeagueScore } from "../leagueSession";
import type { ProviderData } from "../../src/lib/finance/types";
import { runFinancePipeline } from "../../src/lib/finance/pipeline";
import { positions } from "../../src/lib/competition/engine";
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
import { previousMonths, monthEnd } from "../../src/lib/finance/util";
import { MEMBERS } from "../../src/lib/competition/demo";
import { monthPairings } from "../../src/lib/competition/pairings";
import { positionLabel } from "../../src/app/competitionIdentity";
import { calculateEfficiencyScore } from "../../src/lib/finance/scoring";

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
          ? Math.round((c.earned / c.available) * 1000) / 10
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
                ? Math.round((p.earned / p.available) * 1000) / 10
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
  const scenarios: Array<Record<string, unknown>> = [];
  if (result && baseline && active) {
    const input: MoveInput = {
      data,
      asOf,
      lockedBaseline: baseline,
      confirmations: session.confirmations,
      overrides: session.overrides,
    };
    const requested = /\b(?:save|saving|savings|invest|investing)\b/i.test(
      question,
    )
      ? question.match(
          /\$\s*(\d+(?:\.\d{1,2})?)|\b(?:save|invest)(?:\s+another)?\s+(\d+(?:\.\d{1,2})?)/i,
        )
      : null;
    const requestedCents = requested
      ? Math.round(Number(requested[1] ?? requested[2]) * 100)
      : 2500;
    for (const kind of ["save", "invest"] as const) {
      const remaining =
        kind === "save"
          ? user.savingsTargetRemainingCents
          : user.investingTargetRemainingCents;
      const amounts = new Set([
        requestedCents,
        Math.min(user.safeAvailableToAllocateCents ?? 0, remaining ?? 0),
      ]);
      for (const amountCents of amounts) {
        if (!Number.isSafeInteger(amountCents) || amountCents <= 0) continue;
        try {
          const p = simulateMove(input, { kind, amountCents });
          scenarios.push({
            action: kind,
            amountCents,
            status: "hypothetical",
            efficiencyBefore: p.before.score.efficiencyPct,
            efficiencyAfter: p.after.score.efficiencyPct,
            percentagePointDelta: p.percentagePointDelta,
            rawEarnedPointDelta: p.rawPointDelta,
            projectedEfficiencyAfter: p.projectedAfter?.efficiencyPct ?? null,
            explanation: p.explanation,
          });
        } catch (e) {
          scenarios.push({
            action: kind,
            amountCents,
            status: "unavailable",
            reason: e instanceof Error ? e.message : "Cannot verify scenario",
          });
        }
      }
    }
    for (const bill of data.obligations
      .filter((o) => o.status !== "paid" && o.dueDate.startsWith(month))
      .slice(0, 3)) {
      try {
        const p = simulateMove(input, {
          kind: "bill",
          billId: bill.id,
        } as Move);
        scenarios.push({
          action: "pay_due_bill",
          amountCents: p.amountCents,
          status: "hypothetical",
          percentagePointDelta: p.percentagePointDelta,
          execution: "preview_only",
        });
      } catch {
        /* Future bills remain upcoming; no invented early-payment gain. */
      }
    }
  }
  return {
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

import {
  PERSONAS,
  generatePersonaBundle,
  type PersonaSpec,
} from "../finance/demo/personas";
import { nessieToProviderData } from "../finance/adapters/nessie/toProviderData";
import { runFinancePipeline, type PipelineResult } from "../finance/pipeline";
import { calculateEfficiencyScore, type ScoreInput } from "../finance/scoring";
import { addMonths, monthEnd, previousMonths } from "../finance/util";
import type { ProviderData } from "../finance/types";
import { projectMonthEndScore, publicScore, type Matchup } from "./engine";
import { monthPairings } from "./pairings";

// Financial fixtures, not scoreboard numbers. Each variant has its own income,
// obligations, spending history, contributions and derived official baseline.
const variant = (
  base: PersonaSpec,
  key: string,
  firstName: string,
  lastName: string,
  seed: number,
  pay: number,
  savings: number,
  spendScale: number,
): PersonaSpec => ({
  ...base,
  key,
  firstName,
  lastName,
  seed,
  blurb:
    "Synthetic league member with an individually calculated financial baseline.",
  paycheck: { ...base.paycheck, amount: pay },
  savingsTransfer: { amount: savings, day: 15 },
  spend: base.spend.map((s) => ({ ...s, avg: s.avg * spendScale })),
  oneOffs: [],
});
export const MEMBERS = [
  PERSONAS[0],
  PERSONAS[1],
  variant(PERSONAS[0], "alex", "Alex", "Morgan", 43, 750, 100, 1.3),
  variant(PERSONAS[1], "sam", "Sam", "Patel", 61, 1800, 320, 0.85),
  variant(PERSONAS[0], "riley", "Riley", "Brooks", 79, 650, 60, 1.65),
  variant(PERSONAS[1], "avery", "Avery", "Kim", 97, 1600, 200, 1.15),
];
export type PlayerPeriod = {
  spec: PersonaSpec;
  result: PipelineResult;
  input: ScoreInput;
  projection: ReturnType<typeof projectMonthEndScore>;
};
/** Reuses the same settled sample period for league and owner history. */
export function buildSamplePeriod(
  spec: PersonaSpec,
  month: string,
  asOf: string,
) {
  const active = month === asOf.slice(0, 7);
  // Generate through month end for closed periods, then finalize after close.
  const data = nessieToProviderData(
    generatePersonaBundle(spec, active ? asOf : monthEnd(month)),
    "seed",
  );
  if (!active)
    data.transactions = data.transactions.map((t) => ({
      ...t,
      pending: false,
    }));
  const result = runFinancePipeline({
    data,
    asOf: active ? asOf : monthEnd(month),
    now: `${month}-01T00:00:00Z`,
  });
  const input: ScoreInput = {
    profile: result.profile,
    baseline: result.baseline,
    transactions: result.transactions,
    accounts: data.accounts,
    obligations: data.obligations,
    scoringPeriod: {
      month,
      asOf: active ? asOf : `${addMonths(month, 1)}-01`,
    },
  };
  return {
    data,
    result: { ...result, score: calculateEfficiencyScore(input) },
    input,
  };
}
/**
 * Same as buildSamplePeriod, but from real provider data (e.g. a live Nessie
 * customer). Closed months are scored as of their month end with any
 * still-pending records treated as settled, matching the sample league.
 */
export function buildPeriodFromData(
  source: ProviderData,
  month: string,
  asOf: string,
) {
  const active = month === asOf.slice(0, 7);
  const data: ProviderData = active
    ? source
    : {
        ...source,
        transactions: source.transactions.map((t) =>
          t.occurredAt.slice(0, 7) <= month ? { ...t, pending: false } : t,
        ),
      };
  const result = runFinancePipeline({
    data,
    asOf: active ? asOf : monthEnd(month),
    now: `${month}-01T00:00:00Z`,
  });
  const input: ScoreInput = {
    profile: result.profile,
    baseline: result.baseline,
    transactions: result.transactions,
    accounts: data.accounts,
    obligations: data.obligations,
    scoringPeriod: {
      month,
      asOf: active ? asOf : `${addMonths(month, 1)}-01`,
    },
  };
  return {
    data,
    result: { ...result, score: calculateEfficiencyScore(input) },
    input,
  };
}

/**
 * Build the league: four months of periods and round-robin matchups.
 * Without `live`, members are the synthetic sample personas. With `live`,
 * each member's periods come from their real (Nessie) data instead.
 */
export function buildLeague(
  asOf: string,
  selected?: { key: string; result: PipelineResult; input: ScoreInput },
  live?: Record<string, ProviderData>,
) {
  const currentMonth = asOf.slice(0, 7);
  const months = [...previousMonths(currentMonth, 3), currentMonth];
  const members = live ? MEMBERS.filter((m) => live[m.key]) : MEMBERS;
  const periods: Record<string, Record<string, PlayerPeriod>> = {};
  const matches: Matchup[] = [];
  for (const [index, month] of months.entries()) {
    periods[month] = {};
    for (const spec of members) {
      const active = month === currentMonth;
      let { result, input } = live
        ? buildPeriodFromData(live[spec.key], month, asOf)
        : buildSamplePeriod(spec, month, asOf);
      if (active && selected?.key === spec.key) {
        result = selected.result;
        input = selected.input;
      }
      result = { ...result, score: calculateEfficiencyScore(input) };
      periods[month][spec.key] = {
        spec,
        result,
        input,
        projection: projectMonthEndScore(input),
      };
    }
    // Round-robin rotation with a fixed first member (odd count: last sits out).
    for (const [i, [a, b]] of monthPairings(
      members.map((p) => p.key),
      index,
    ).entries()) {
      matches.push({
        id: `${month}-${i}`,
        month,
        a,
        b,
        status: month === currentMonth ? "active" : "final",
        scores: {
          [a]: publicScore(periods[month][a].result.score),
          [b]: publicScore(periods[month][b].result.score),
        },
      });
    }
  }
  if (live) {
    // Real data has no history before its first month, so a baseline can't lock
    // there. Drop months that aren't fully scoreable (never the current month).
    const scoreable = (m: string) =>
      m === currentMonth ||
      members.every(
        (p) => periods[m][p.key].result.baseline.status === "locked",
      );
    const keep = months.filter(scoreable);
    return {
      months: keep,
      periods,
      matches: matches.filter((m) => keep.includes(m.month)),
      members: members.map((m) => m.key),
      live: true,
    };
  }
  return {
    months,
    periods,
    matches,
    members: members.map((m) => m.key),
    live: !!live,
  };
}
export type DemoLeague = ReturnType<typeof buildLeague>;

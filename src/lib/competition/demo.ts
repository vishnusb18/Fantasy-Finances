import {
  PERSONAS,
  generatePersonaBundle,
  type PersonaSpec,
} from "../finance/demo/personas";
import { nessieToProviderData } from "../finance/adapters/nessie/toProviderData";
import { runFinancePipeline, type PipelineResult } from "../finance/pipeline";
import { calculateEfficiencyScore, type ScoreInput } from "../finance/scoring";
import { addMonths, monthEnd, previousMonths } from "../finance/util";
import { projectMonthEndScore, publicScore, type Matchup } from "./engine";

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
export function buildLeague(
  asOf: string,
  selected?: { key: string; result: PipelineResult; input: ScoreInput },
) {
  const currentMonth = asOf.slice(0, 7);
  const months = [...previousMonths(currentMonth, 3), currentMonth];
  const periods: Record<string, Record<string, PlayerPeriod>> = {};
  const matches: Matchup[] = [];
  for (const [index, month] of months.entries()) {
    periods[month] = {};
    for (const spec of MEMBERS) {
      const active = month === currentMonth;
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
      let result = runFinancePipeline({
        data,
        asOf: active ? asOf : monthEnd(month),
        now: `${month}-01T00:00:00Z`,
      });
      let input: ScoreInput = {
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
    // Round-robin rotation with a fixed first member.
    const ids = MEMBERS.map((p) => p.key);
    const rest = ids.slice(1);
    for (let i = 0; i < index; i++) rest.unshift(rest.pop()!);
    const order = [ids[0], ...rest];
    for (let i = 0; i < 3; i++) {
      const a = order[i],
        b = order[5 - i];
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
  return { months, periods, matches };
}
export type DemoLeague = ReturnType<typeof buildLeague>;

import { calculateFeasiblePotentialScore, positions, winner } from "./engine";
import type { DemoLeague } from "./demo";
import { addMonths } from "../finance/util";
export function monthlyReport(league: DemoLeague, month: string) {
  const matches = league.matches.filter(
    (m) => m.month === month && m.status === "final",
  );
  if (!matches.length) return null;
  const players = Object.entries(league.periods[month]).map(([id, p]) => ({
    id,
    ...p,
    potential: calculateFeasiblePotentialScore(p.input, p.result.score),
  }));
  const eligible = players.filter((p) => p.result.score.efficiencyPct !== null);
  if (!eligible.length) return null;
  const ranked = [...eligible].sort(
    (a, b) => b.result.score.efficiencyPct! - a.result.score.efficiencyPct!,
  );
  const margins = matches
    .filter((m) => winner(m) !== undefined)
    .map((m) => ({
      match: m,
      margin: Math.abs(m.scores[m.a].efficiency! - m.scores[m.b].efficiency!),
    }))
    .sort((a, b) => a.margin - b.margin);
  const improvements = eligible
    .flatMap((p) => {
      const prev =
        league.periods[addMonths(month, -1)]?.[p.id]?.result.score
          .efficiencyPct;
      return prev == null
        ? []
        : [{ id: p.id, delta: p.result.score.efficiencyPct! - prev }];
    })
    .filter((p) => p.delta > 0)
    .sort((a, b) => b.delta - a.delta);
  const categoryLeaders = positions(ranked[0].result.score).flatMap((pos) => {
    const scores = eligible
      .map((p) => ({
        id: p.id,
        position: positions(p.result.score).find((l) => l.key === pos.key)!,
      }))
      .filter((p) => p.position.eligible && p.position.available > 0)
      .sort(
        (a, b) =>
          b.position.earned / b.position.available -
          a.position.earned / a.position.available,
      );
    return scores.length ? [scores[0]] : [];
  });
  const losers = matches
    .flatMap((m) => {
      const w = winner(m);
      return w ? [w === m.a ? m.b : m.a] : [];
    })
    .sort(
      (a, b) =>
        league.periods[month][b].result.score.efficiencyPct! -
        league.periods[month][a].result.score.efficiencyPct!,
    );
  const discipline = [...eligible]
    .filter((p) => p.result.score.components.spending.available > 0)
    .sort(
      (a, b) =>
        b.result.score.components.spending.earned /
          b.result.score.components.spending.available -
        a.result.score.components.spending.earned /
          a.result.score.components.spending.available,
    )[0];
  const savings = categoryLeaders.find((l) => l.position.key === "savings");
  const opportunity = [...eligible].sort(
    (a, b) => b.potential.gain - a.potential.gain,
  )[0];
  return {
    players,
    ranked,
    matches,
    margins,
    improvements,
    categoryLeaders,
    losers,
    awards: [
      {
        title: "Most efficient manager",
        id: ranked[0].id,
        value: `${ranked[0].result.score.efficiencyPct}%`,
        why: "Highest finalized normalized efficiency.",
      },
      {
        title: "Lowest efficiency",
        id: ranked.at(-1)!.id,
        value: `${ranked.at(-1)!.result.score.efficiencyPct}%`,
        why: "Lowest finalized normalized efficiency this month.",
      },
      ...(savings
        ? [
            {
              title: "Savings MVP",
              id: savings.id,
              value: `${((savings.position.earned / savings.position.available) * 100).toFixed(1)}%`,
              why: "Highest eligible savings target completion.",
            },
          ]
        : []),
      ...(discipline
        ? [
            {
              title: "Spending discipline",
              id: discipline.id,
              value: `${((discipline.result.score.components.spending.earned / discipline.result.score.components.spending.available) * 100).toFixed(1)}%`,
              why: "Highest discretionary points as a share of eligible spending points.",
            },
          ]
        : []),
      ...(improvements.length
        ? [
            {
              title: "Biggest improvement",
              id: improvements[0].id,
              value: `+${improvements[0].delta.toFixed(1)}`,
              why: "Normalized points above the previous completed month.",
            },
          ]
        : []),
      ...(opportunity && opportunity.potential.gain > 0
        ? [
            {
              title: "Points left on the bench",
              id: opportunity.id,
              value: `+${opportunity.potential.gain.toFixed(1)} pts`,
              why: "Largest feasible hypothetical gain; official results stay fixed.",
            },
          ]
        : []),
    ],
  };
}

import type { EfficiencyScoreSnapshot } from "../finance/types";

const r1 = (x: number) => Math.round(x * 10) / 10;

/**
 * The public score summary a player publishes to the league (SpacetimeDB
 * `publish_score`). Category points only — never amounts or transactions.
 * Shared by the browser and the league simulator so both publish identically.
 */
export function publicScoreArgs(s: EfficiencyScoreSnapshot) {
  return {
    playerKey: s.playerId,
    month: s.month,
    scoringVersion: s.scoringVersion,
    status: s.status,
    efficiencyPct: s.efficiencyPct ?? undefined,
    earnedPoints: r1(s.earnedPoints),
    availablePoints: r1(s.availablePoints),
    categories: s.categoryLines.map((l) => ({
      category: l.category,
      eligible: l.eligible,
      earned: r1(l.earned),
      available: r1(l.available),
    })),
  };
}

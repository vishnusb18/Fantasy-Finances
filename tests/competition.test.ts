import { describe, expect, it } from "vitest";
import { buildLeague, MEMBERS } from "../src/lib/competition/demo";
import {
  calculateFeasiblePotentialScore,
  positions,
  projectMonthEndScore,
  publicScore,
  standings,
  winner,
  type Matchup,
} from "../src/lib/competition/engine";
import { monthlyReport } from "../src/lib/competition/reports";
import {
  calculateEfficiencyScore,
  budgetAdherence,
  type ScoreInput,
} from "../src/lib/finance/scoring";
import {
  accounts,
  baselineFor,
  profileWith,
  spend,
  tx,
  toSavings,
  bill,
} from "./helpers";
import { netInvestmentContributionsCents } from "../src/lib/finance/normalize";
const league = buildLeague("2026-11-07");
const input = (): ScoreInput => ({
  profile: profileWith({}),
  baseline: baselineFor({}),
  transactions: [],
  accounts,
  obligations: [],
  scoringPeriod: { month: "2026-11", asOf: "2026-12-01" },
});

describe("competition scoring integrity", () => {
  it("applies proportional spending and handles locked zero budgets safely", () => {
    expect(budgetAdherence(7500, 6000)).toBe(0.75);
    expect(budgetAdherence(0, 0)).toBe(1);
    expect(budgetAdherence(1, 0)).toBe(0);
    expect(budgetAdherence(20000, 6000)).toBe(0);
  });
  it("waits for pending settlement before finalizing a closed month", () => {
    const i = input();
    i.transactions = [
      spend("2026-11-30", 1500, "dining_out", { pending: true }),
    ];
    expect(calculateEfficiencyScore(i).status).toBe("provisional");
    expect(
      calculateEfficiencyScore({
        ...i,
        transactions: i.transactions.map((t) => ({ ...t, pending: false })),
      }).status,
    ).toBe("final");
  });
  it("public score serialization contains no private financial values or explanations", () => {
    const p = league.periods["2026-11"].maya;
    const pub = publicScore(p.result.score);
    const serialized = JSON.stringify(pub);
    expect(serialized).not.toContain("budgetCents");
    expect(serialized).not.toContain("targetCents");
    expect(serialized).not.toContain("amountCents");
    expect(serialized).not.toContain("Campus Commons");
    expect(serialized).not.toContain("$");
  });
  it("uses fixed position weights, redistributed across eligible categories", () => {
    const i = input();
    const s = calculateEfficiencyScore(i);
    const lines = s.categoryLines.filter((l) => l.eligible);
    const dining = lines.find((l) => l.category === "dining_out")!,
      shopping = lines.find((l) => l.category === "shopping")!;
    expect(dining.available / shopping.available).toBeCloseTo(10 / 8, 8);
    expect(lines.reduce((n, l) => n + l.available, 0)).toBeCloseTo(35, 8);
  });
  it("reconciles every position with the overall score without intermediate rounding loss", () => {
    for (const period of Object.values(league.periods))
      for (const p of Object.values(period)) {
        const lines = positions(p.result.score);
        expect(lines.reduce((n, l) => n + l.earned, 0)).toBeCloseTo(
          p.result.score.earnedPoints,
          8,
        );
        expect(lines.reduce((n, l) => n + l.available, 0)).toBeCloseTo(
          p.result.score.availablePoints,
          8,
        );
      }
  });
  it("excludes pending spending from actual points but retains it for projection inputs", () => {
    const i = input();
    const target = i.baseline.discretionary.categories.dining_out.budgetCents;
    i.transactions = [
      spend("2026-11-04", target * 3, "dining_out", { pending: true }),
    ];
    const s = calculateEfficiencyScore(i);
    expect(s.components.spending.earned).toBeCloseTo(35);
    expect(
      s.categoryLines.find((l) => l.category === "dining_out")!.pendingCents,
    ).toBe(target * 3);
    expect(
      calculateEfficiencyScore({
        ...i,
        transactions: i.transactions.map((t) => ({ ...t, pending: false })),
      }).components.spending.earned,
    ).toBeLessThan(35);
  });
  it("applies the total cap even to unscored nightlife", () => {
    const i = input();
    i.baseline = baselineFor({
      categorySpendHistoryCents: { dining_out: 10000 },
    });
    i.transactions = [
      spend("2026-11-04", i.baseline.discretionary.totalCents * 2, "nightlife"),
    ];
    const s = calculateEfficiencyScore(i);
    expect(s.components.spending.earned).toBe(0);
    expect(s.categoryLines.every((l) => l.earned === 0)).toBe(true);
  });
  it("does not count an internal savings transfer as an investment too", () => {
    expect(
      netInvestmentContributionsCents([
        {
          ...toSavings("2026-11-03", 5000),
          category: "investment_contribution",
        },
      ]),
    ).toBe(0);
  });
  it("preserves Maya profile and regression score", () => {
    const p = league.periods["2026-11"].maya;
    expect(p.result.profile.estimatedMonthlyNetIncomeCents).toBe(105000);
    expect(p.result.baseline.budgetableCapacityCents).toBe(24650);
    expect(p.result.score.earnedPoints).toBeCloseTo(70.6, 1);
    expect(p.result.score.availablePoints).toBe(80);
  });
});

describe("projections", () => {
  it("returns insufficient data instead of making up a projection", () => {
    const i = input();
    i.scoringPeriod.asOf = "2026-11-07";
    expect(projectMonthEndScore(i).score).toBeNull();
  });
  it("returns finalized actual scores without forecasting a completed period", () => {
    const p = league.periods["2026-10"].maya;
    expect(projectMonthEndScore(p.input).score).toEqual(p.result.score);
  });
  it("recomputes projection from corrected current financial activity", () => {
    const p = league.periods["2026-11"].maya;
    const before = projectMonthEndScore(p.input).score!;
    const after = projectMonthEndScore({
      ...p.input,
      transactions: [
        ...p.input.transactions,
        spend("2026-11-04", 50000, "dining_out"),
      ],
    }).score!;
    expect(after.efficiencyPct!).toBeLessThan(before.efficiencyPct!);
    expect(before.status).toBe("final"); // internal projected ledger evaluated at month close; UI labels projection
  });
  it("does not extrapolate a subscription already paid this month or invent contributions", () => {
    const p = league.periods["2026-11"].maya;
    const projection = projectMonthEndScore(p.input).score!;
    const sub = projection.categoryLines.find(
      (l) => l.category === "subscriptions",
    )!;
    expect(sub.actualCents).toBe(2000); // Spotify $5 + Netflix $15, once each
    expect(projection.components.savings.earned).toBe(
      p.result.score.components.savings.earned,
    );
  });
  it("does not mark future obligations missed in the current actual score", () => {
    const i = input();
    i.scoringPeriod.asOf = "2026-11-07";
    i.obligations = [bill("phone", "2026-11-20", 3500, "due")];
    expect(calculateEfficiencyScore(i).components.bills.eligible).toBe(false);
  });
});

describe("final records and reports", () => {
  it("derives standings only from final matchups", () => {
    const records = standings(
      MEMBERS.map((p) => p.key),
      league.matches,
    );
    expect(records).toHaveLength(6);
    expect(records.every((r) => r.wins + r.losses + r.ties === 3)).toBe(true);
    expect(records.reduce((s, r) => s + r.wins, 0)).toBe(
      records.reduce((s, r) => s + r.losses, 0),
    );
    expect(records.reduce((s, r) => s + r.pointsFor, 0)).toBeCloseTo(
      records.reduce((s, r) => s + r.pointsAgainst, 0),
      1,
    );
  });
  it("normalizes eligible denominators to select winners, and records ties separately", () => {
    const a = publicScore(league.periods["2026-10"].maya.result.score),
      b = publicScore(league.periods["2026-10"].jordan.result.score);
    const m: Matchup = {
      id: "x",
      month: "2026-10",
      a: "maya",
      b: "jordan",
      status: "final",
      scores: {
        maya: { ...a, efficiency: 90 },
        jordan: { ...b, efficiency: 85 },
      },
    };
    expect(winner(m)).toBe("maya");
    expect(winner({ ...m, status: "active" })).toBeUndefined();
    m.scores.jordan.efficiency = 90;
    expect(winner(m)).toBeNull();
    expect(standings(["maya", "jordan"], [m]).every((r) => r.ties === 1)).toBe(
      true,
    );
  });
  it("reports only completed months and generates category leaders from actual scores", () => {
    expect(monthlyReport(league, "2026-11")).toBeNull();
    const report = monthlyReport(league, "2026-10")!;
    expect(report.matches).toHaveLength(3);
    expect(report.ranked[0].result.score.efficiencyPct).toBe(
      Math.max(...report.players.map((p) => p.result.score.efficiencyPct!)),
    );
    expect(report.categoryLeaders.every((l) => l.position.eligible)).toBe(true);
  });
  it("keeps final historical records independent from current transaction corrections", () => {
    const p = league.periods["2026-11"].maya;
    const modified = {
      ...p.result,
      transactions: [
        ...p.result.transactions,
        spend("2026-11-04", 50000, "shopping"),
      ],
    };
    const changed = buildLeague("2026-11-07", {
      key: "maya",
      result: modified,
      input: { ...p.input, transactions: modified.transactions },
    });
    expect(changed.matches.filter((m) => m.status === "final")).toEqual(
      league.matches.filter((m) => m.status === "final"),
    );
  });
});

describe("feasible retrospective allocation", () => {
  it("allocates safe cash once, savings first, without exceeding eligible points", () => {
    const i = input();
    i.profile.availableCheckingBalanceCents = 14000;
    i.profile.reserveAllocationCents = 0;
    i.baseline.savings = {
      eligible: true,
      targetCents: 10000,
      explanation: "test",
    };
    i.baseline.investing = {
      eligible: true,
      targetCents: 6000,
      explanation: "test",
    };
    i.transactions = [
      toSavings("2026-11-03", 8000),
      tx({
        occurredAt: "2026-11-03",
        amountCents: -3000,
        category: "investment_contribution",
        kind: "transfer",
      }),
    ];
    const actual = calculateEfficiencyScore(i),
      potential = calculateFeasiblePotentialScore(i, actual);
    expect(potential.opportunities.map((o) => o.amountCents)).toEqual([
      2000, 2000,
    ]);
    expect(potential.gain).toBeCloseTo(10, 1);
    expect(potential.earned).toBeLessThanOrEqual(actual.availablePoints);
    expect(potential.efficiency!).toBeLessThanOrEqual(100);
  });
  it("respects unpaid debt and reserves, never recommending unavailable cash", () => {
    const i = input();
    i.profile.availableCheckingBalanceCents = 20000;
    i.profile.reserveAllocationCents = 6000;
    i.profile.obligations = [bill("debt", "2026-11-20", 8000, "due")];
    expect(calculateFeasiblePotentialScore(i).gain).toBe(0);
  });
  it("reports insufficient liquidity data explicitly", () => {
    const i = input();
    i.profile.availableCheckingBalanceCents = null;
    const p = calculateFeasiblePotentialScore(i);
    expect(p.sufficientData).toBe(false);
    expect(p.gain).toBe(0);
  });
  it("cannot award hypothetical points for ineligible investing or change actual records", () => {
    const p = league.periods["2026-10"].maya;
    const original = JSON.stringify(p.result.score);
    const potential = calculateFeasiblePotentialScore(p.input, p.result.score);
    expect(
      potential.opportunities.some((o) => o.category === "investing"),
    ).toBe(false);
    expect(JSON.stringify(p.result.score)).toBe(original);
  });
});

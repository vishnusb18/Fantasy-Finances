import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { adjacentMonth, MonthNavigation } from "../src/app/MonthNavigation";
import { financeMonths, financeMonthView } from "../src/app/financeMonth";
import type { FinanceState } from "../src/app/useFinance";
import {
  buildLeague,
  buildSamplePeriod,
  MEMBERS,
} from "../src/lib/competition/demo";
import { monthlyReport } from "../src/lib/competition/reports";
import {
  PotentialComparison,
  defensiblePotential,
} from "../src/app/PotentialComparison";
import { positions } from "../src/lib/competition/engine";
import { createPersonalBudget } from "../src/lib/finance/baseline";
import { TransactionsSection } from "../src/app/TransactionsSection";
import { BudgetSection } from "../src/app/BudgetSection";
import { ProfileSection } from "../src/app/ProfileSection";
import { FiveBubbleMeter } from "../src/app/MatchupTickets";

function sample(): FinanceState {
  const { data, result } = buildSamplePeriod(
    MEMBERS[0],
    "2026-11",
    "2026-11-07",
  );
  return {
    data,
    result,
    month: "2026-11",
    asOf: "2026-11-07",
    source: { kind: "sample", persona: "maya" },
    personal: createPersonalBudget(result.baseline),
    confirmations: {},
    overrides: [],
    recategorize: vi.fn(),
    editPersonal: vi.fn(),
    updateConfirmations: vi.fn(),
    applyCorrectionsToBaseline: vi.fn(),
    resetPlayer: vi.fn(),
  } as unknown as FinanceState;
}
describe("V5 period navigation and bubble triggers", () => {
  const months = ["2026-08", "2026-09", "2026-10", "2026-11"];
  it("bounds previous/next at the first, middle and last actual periods", () => {
    expect(adjacentMonth(months, "2026-08", -1)).toBeNull();
    expect(adjacentMonth(months, "2026-09", -1)).toBe("2026-08");
    expect(adjacentMonth(months, "2026-09", 1)).toBe("2026-10");
    expect(adjacentMonth(months, "2026-11", 1)).toBeNull();
    expect(adjacentMonth(months, "2026-12", -1)).toBeNull();
    expect(adjacentMonth([], "2026-11", 1)).toBeNull();
  });
  it("announces the month and disables only unavailable arrows", () => {
    const html = renderToStaticMarkup(
      <MonthNavigation months={months} value="2026-11" onChange={() => {}} />,
    );
    expect(html).toContain("November 2026");
    expect(html).toContain('aria-live="polite"');
    expect(html).toMatch(/aria-label="Next month" disabled/);
    expect(html).not.toMatch(/aria-label="Previous month" disabled/);
  });
  it("applies an explicit period animation key, never inferring triggers from changing points", () => {
    const initial = renderToStaticMarkup(
      <FiveBubbleMeter earned={7.5} maximum={10} period="2026-11" />,
    );
    const update = renderToStaticMarkup(
      <FiveBubbleMeter earned={9} maximum={10} period="2026-10" animate />,
    );
    expect(initial).not.toContain("period-ripple");
    expect(update).toContain("period-ripple");
    expect(update).toContain('data-period="2026-10"');
    expect(update.match(/class="bubble bubble-/g)).toHaveLength(5);
    expect(update).toContain("--bubble-delay:180ms");
  });
});
describe("one coherent My Finances period", () => {
  it("reuses the current state and preserves the current official baseline and personal goals", () => {
    const f = sample();
    expect(financeMonthView(f, "2026-11")).toBe(f);
  });
  it("uses exactly the league finalized sample period for historical score, baseline and records", () => {
    const f = sample(),
      league = buildLeague(f.asOf),
      past = financeMonthView(f, "2026-10");
    expect(past.month).toBe("2026-10");
    expect(past.result!.profile.month).toBe("2026-10");
    expect(past.result!.score).toEqual(
      league.periods["2026-10"].maya.result.score,
    );
    expect(past.result!.baseline).toEqual(
      league.periods["2026-10"].maya.result.baseline,
    );
    expect(past.readOnly).toBe(true);
    expect(past.personal).toBeUndefined();
    expect(
      positions(past.result!.score).reduce((n, l) => n + l.earned, 0),
    ).toBeCloseTo(past.result!.score.earnedPoints, 8);
  });
  it("does not modify finalized samples with current goals, corrections or confirmations", () => {
    const f = sample(),
      before = financeMonthView(f, "2026-10");
    f.personal!.savingsGoalCents = 1;
    f.confirmations = { monthlyNetIncomeCents: 99999999 };
    f.overrides = [
      {
        transactionId: f.data!.transactions[0].id,
        category: "shopping",
        correctedAt: "2026-11-07",
      },
    ];
    expect(financeMonthView(f, "2026-10").result).toEqual(before.result);
  });
  it("disables archived edits and hides unknown historical balances/confirmations", () => {
    const f = sample(),
      past = financeMonthView(f, "2026-10");
    past.recategorize("any", "dining_out");
    past.editPersonal({ savingsGoalCents: 1 });
    expect(f.recategorize).not.toHaveBeenCalled();
    expect(f.editPersonal).not.toHaveBeenCalled();
    const tx = renderToStaticMarkup(<TransactionsSection f={past} />);
    expect(tx).toContain('disabled=""');
    expect(tx).not.toContain('aria-label="Month"');
    const profile = renderToStaticMarkup(<ProfileSection f={past} />);
    expect(profile).not.toContain("Checking balance");
    expect(profile).not.toContain("Review profile");
    const budget = renderToStaticMarkup(<BudgetSection f={past} />);
    expect(budget).not.toContain("Your goal");
    expect(budget).not.toContain("<input");
  });
  it("transaction rows all follow the selected page month", () => {
    const f = financeMonthView(sample(), "2026-10");
    const html = renderToStaticMarkup(<TransactionsSection f={f} />);
    expect(html).toContain("10-");
    expect(html).not.toContain("11-06");
    expect(html).not.toContain('aria-label="Month"');
  });
  it("does not generate sample history for live accounts or accept future periods", () => {
    const f = sample();
    f.source = { kind: "nessie", customerId: "live" };
    f.data = {
      ...f.data!,
      playerId: "nessie:live",
      source: "nessie",
      transactions: f.data!.transactions.filter((t) =>
        t.occurredAt.startsWith("2026-11"),
      ),
      obligations: [],
    };
    expect(financeMonths(f)).toEqual(["2026-11"]);
    expect(financeMonthView(f, "2026-10").result).toBeNull();
    expect(financeMonthView(f, "2026-12").result).toBeNull();
  });
  it("reuses a stored locked baseline for real live history", () => {
    const f = sample();
    f.source = { kind: "nessie", customerId: "live" };
    f.data = { ...f.data!, playerId: "nessie:live", source: "nessie" };
    const initial = financeMonthView(f, "2026-10");
    const locked = {
      ...initial.result!.baseline,
      id: "archived-lock",
      version: 2,
    };
    const view = financeMonthView(f, "2026-10", locked);
    expect(view.result!.baseline).toBe(locked);
  });
  it("keeps actual pending live history provisional instead of silently settling it", () => {
    const f = sample();
    f.source = { kind: "nessie", customerId: "live" };
    f.data = {
      ...f.data!,
      playerId: "nessie:live",
      source: "nessie",
      transactions: f.data!.transactions.map((t) => ({
        ...t,
        playerId: "nessie:live",
        pending: t.occurredAt.startsWith("2026-10"),
      })),
    };
    const past = financeMonthView(f, "2026-10");
    expect(past.result!.score.status).toBe("provisional");
    expect(
      past.result!.transactions.some(
        (t) => t.pending && t.occurredAt.startsWith("2026-10"),
      ),
    ).toBe(true);
  });
  it("never displays the previous source’s account state during a source switch", () => {
    const f = sample();
    f.source = { kind: "nessie", customerId: "other" };
    expect(financeMonthView(f, "2026-11").result).toBeNull();
    expect(financeMonths(f)).toEqual([f.month]);
  });
});
describe("league-only paired comparison chart", () => {
  const report = monthlyReport(buildLeague("2026-11-07"), "2026-10")!;
  it("renders exactly two independent series per manager on a common 0–100 scale", () => {
    const html = renderToStaticMarkup(
      <PotentialComparison report={report} onMember={() => {}} />,
    );
    expect(html.match(/data-series="actual"/g)).toHaveLength(6);
    expect(html.match(/data-series="potential"/g)).toHaveLength(6);
    expect(html).toContain("100%");
    expect(html).toContain("Actual");
    expect(html).toContain("Potential");
    expect(html).not.toContain("competition-meter");
    expect(html).not.toContain("personal-report");
  });
  it("withholds missing data and caps hypothetical contributions at remaining capacity", () => {
    const p = structuredClone(report.players[0]);
    p.potential.sufficientData = false;
    expect(defensiblePotential(p)).toBeNull();
    p.potential.sufficientData = true;
    p.input.baseline.budgetableCapacityCents = 0;
    p.potential.opportunities = [
      { category: "savings", amountCents: 1, points: 1, explanation: "test" },
    ];
    expect(defensiblePotential(p)).toBeCloseTo(
      p.result.score.efficiencyPct!,
      1,
    );
  });
  it("never raises potential above the existing model or mutates finalized records", () => {
    for (const p of report.players) {
      const before = JSON.stringify(p);
      const value = defensiblePotential(p);
      if (value !== null) {
        expect(value).toBeLessThanOrEqual(p.potential.efficiency! + 0.05);
        expect(value).toBeGreaterThanOrEqual(
          p.result.score.efficiencyPct! - 0.05,
        );
      }
      expect(JSON.stringify(p)).toBe(before);
    }
  });
  it("supports equal actual and potential without inventing a gain or changing official scores", () => {
    const p = structuredClone(report.players[0]);
    const snapshot = JSON.stringify(p.result.score);
    p.potential = {
      ...p.potential,
      opportunities: [],
      gain: 0,
      efficiency: p.result.score.efficiencyPct,
      sufficientData: true,
    };
    p.input.profile.availableCheckingBalanceCents = 0;
    expect(defensiblePotential(p)).toBeCloseTo(
      p.result.score.efficiencyPct!,
      1,
    );
    expect(JSON.stringify(p.result.score)).toBe(snapshot);
  });
});

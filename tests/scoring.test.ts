import { describe, expect, it } from "vitest";
import { nessieToProviderData } from "../src/lib/finance/adapters/nessie/toProviderData";
import {
  createPersonalBudget,
  updatePersonalBudget,
} from "../src/lib/finance/baseline";
import {
  generatePersonaBundle,
  PERSONAS,
} from "../src/lib/finance/demo/personas";
import { normalizeTransactions } from "../src/lib/finance/normalize";
import { runFinancePipeline } from "../src/lib/finance/pipeline";
import { calculateEfficiencyScore } from "../src/lib/finance/scoring";
import type {
  NormalizedTransaction,
  Obligation,
  ScoringBaseline,
} from "../src/lib/finance/types";
import {
  accounts,
  baselineFor,
  bill,
  NOW,
  policy,
  profileWith,
  spend,
  toSavings,
  tx,
} from "./helpers";

const FULL_MONTH = { month: "2026-11", asOf: "2026-12-01" };
const MID_MONTH = { month: "2026-11", asOf: "2026-11-07" };

const score = (
  baseline: ScoringBaseline,
  transactions: NormalizedTransaction[],
  obligations: Obligation[] = [],
  period = FULL_MONTH,
) =>
  calculateEfficiencyScore({
    profile: profileWith({}),
    transactions: normalizeTransactions(transactions),
    obligations,
    accounts,
    baseline,
    scoringPeriod: period,
    policy,
  });

/** Spend exactly each category budget, hit savings/investing targets, pay bills. */
function perfectMonth(b: ScoringBaseline): NormalizedTransaction[] {
  const out: NormalizedTransaction[] = [];
  for (const [c, line] of Object.entries(b.discretionary.categories)) {
    if (line.budgetCents > 0)
      out.push(
        spend(
          "2026-11-10",
          line.budgetCents,
          c as NormalizedTransaction["category"],
        ),
      );
  }
  if (b.savings.targetCents)
    out.push(toSavings("2026-11-15", b.savings.targetCents));
  if (b.investing.targetCents) {
    out.push(
      tx({
        occurredAt: "2026-11-03",
        amountCents: -b.investing.targetCents,
        category: "investment_contribution",
        kind: "transfer",
      }),
    );
  }
  return out;
}

describe("calculateEfficiencyScore", () => {
  it("scores $1,000/mo and $4,000/mo players equally for equally responsible behavior", () => {
    const student = baselineFor({
      estimatedMonthlyNetIncomeCents: 100_000,
      essentialMonthlyExpensesCents: 65_000,
      requiredMonthlyDebtPaymentsCents: 2_500,
      reserveAllocationCents: 5_000,
      hasInvestmentActivity: false,
    });
    const earner = baselineFor({
      estimatedMonthlyNetIncomeCents: 400_000,
      reserveAllocationCents: 20_000,
    });
    const bills = [bill("rent", "2026-11-01", 50_000)];
    const s1 = score(student, perfectMonth(student), bills);
    const s2 = score(earner, perfectMonth(earner), bills);
    expect(s1.efficiencyPct).toBe(100);
    expect(s2.efficiencyPct).toBe(100);
    expect(s1.availablePoints).toBeLessThan(s2.availablePoints); // investing not applicable to the student
  });

  it("low-goal exploit: lowering the personal savings goal does not raise the official score", () => {
    const b = baselineFor({});
    const saved25 = [toSavings("2026-11-15", 2_500)];
    const before = score(b, saved25);
    const personal = updatePersonalBudget(
      createPersonalBudget(b, NOW),
      { savingsGoalCents: 2_500 },
      NOW,
    );
    const after = score(b, saved25); // personal budget is not even an input
    expect(personal.savingsGoalCents).toBe(2_500);
    expect(after.components.savings.earned).toBe(
      before.components.savings.earned,
    );
    // $25 of a $245 target ≈ 10% of 25 points.
    expect(after.components.savings.earned).toBeCloseTo(2.6, 1);
  });

  it("spending $0 earns full (not extra) points; overspending reduces them proportionally", () => {
    const b = baselineFor({});
    const zero = score(b, []);
    expect(zero.components.spending.earned).toBe(35);
    const dining = b.discretionary.categories.dining_out.budgetCents;
    const over = score(b, [
      spend("2026-11-05", Math.round(dining * 1.5), "dining_out"),
    ]);
    const line = over.categoryLines.find((l) => l.category === "dining_out")!;
    // Both sides are rounded to 0.1 pts independently.
    expect(Math.abs(line.earned - line.available / 2)).toBeLessThanOrEqual(0.1);
  });

  it("zero-budget category: no divide-by-zero, but spending still hits the overall cap", () => {
    const b = baselineFor({
      categorySpendHistoryCents: { dining_out: 10_000 },
    });
    expect(b.discretionary.categories.nightlife.budgetCents).toBe(0);
    const s = score(b, [
      spend("2026-11-05", b.discretionary.totalCents * 2, "nightlife"),
    ]);
    const night = s.categoryLines.find((l) => l.category === "nightlife")!;
    expect(night).toMatchObject({ eligible: false, earned: 0, available: 0 });
    expect(Number.isFinite(s.components.spending.earned)).toBe(true);
    expect(s.components.spending.earned).toBe(0); // v2: all category points constrained by the overall cap
  });

  it("refunds reduce category spend", () => {
    const b = baselineFor({});
    const budget = b.discretionary.categories.shopping.budgetCents;
    const s = score(b, [
      spend("2026-11-05", budget + 5_000, "shopping"),
      tx({
        occurredAt: "2026-11-08",
        amountCents: 5_000,
        category: "shopping",
        kind: "refund",
      }),
    ]);
    expect(s.categoryLines.find((l) => l.category === "shopping")!.earned).toBe(
      s.categoryLines.find((l) => l.category === "shopping")!.available,
    );
  });

  it("transfers: savings counted once; circular moves earn nothing; card repayment not double counted", () => {
    const b = baselineFor({});
    const back = tx({
      occurredAt: "2026-11-20",
      amountCents: -b.savings.targetCents,
      category: "savings_transfer",
      kind: "transfer",
      isInternalTransfer: true,
      accountId: "sav",
      counterpartyAccountId: "chk",
    });
    expect(
      score(b, [toSavings("2026-11-10", b.savings.targetCents), back])
        .components.savings.earned,
    ).toBe(0);

    const dining = b.discretionary.categories.dining_out.budgetCents;
    const s = score(b, [
      spend("2026-11-05", dining, "dining_out", { accountId: "card" }),
      tx({
        occurredAt: "2026-11-25",
        amountCents: -dining,
        category: "debt_payment",
        kind: "payment",
        isInternalTransfer: true,
        counterpartyAccountId: "card",
      }),
    ]);
    expect(
      s.categoryLines.find((l) => l.category === "dining_out")!.actualCents,
    ).toBe(dining);
  });

  it("no bills due → bills not scored; percentage uses remaining points", () => {
    const b = baselineFor({});
    const s = score(
      b,
      perfectMonth(b),
      [bill("phone", "2026-11-20", 3_500, "due")],
      MID_MONTH,
    );
    expect(s.components.bills.eligible).toBe(false);
    expect(s.availablePoints).toBe(75);
    expect(s.pending.some((p) => p.includes("phone"))).toBe(true);
  });

  it("month in progress: provisional, and an upcoming bill is pending, not penalized", () => {
    const b = baselineFor({});
    const obligations = [
      bill("rent", "2026-11-01", 100_000, "paid"),
      bill("phone", "2026-11-20", 3_500, "due"),
    ];
    const s = score(b, [], obligations, MID_MONTH);
    expect(s.status).toBe("provisional");
    expect(s.components.bills).toMatchObject({
      eligible: true,
      earned: 20,
      available: 20,
    });
  });

  it("an overdue bill costs its share of bill points once the due date passes", () => {
    const b = baselineFor({});
    const obligations = [
      bill("rent", "2026-11-01", 100_000, "paid"),
      bill("phone", "2026-11-20", 3_500, "due"),
    ];
    const s = score(b, [], obligations, FULL_MONTH);
    expect(s.status).toBe("final");
    expect(s.components.bills.earned).toBe(10);
  });

  it("an ineligible investing component does not lower the percentage", () => {
    const b = baselineFor({ hasInvestmentActivity: false });
    const s = score(b, perfectMonth(b), [bill("rent", "2026-11-01", 100_000)]);
    expect(s.components.investing.eligible).toBe(false);
    expect(s.efficiencyPct).toBe(100);
  });

  it("investment gains/dividends are not rewarded", () => {
    const b = baselineFor({});
    const dividend = tx({
      occurredAt: "2026-11-12",
      amountCents: 50_000,
      category: "income",
      kind: "income",
      incomeEligible: false,
      description: "Vanguard dividend",
    });
    expect(score(b, [dividend]).components.investing.earned).toBe(0);
  });

  it("a category correction changes the score deterministically", () => {
    const b = baselineFor({});
    const big = spend(
      "2026-11-05",
      b.discretionary.categories.dining_out.budgetCents * 2,
      "dining_out",
      { id: "costco" },
    );
    const wrong = score(b, [big]);
    const fixed = calculateEfficiencyScore({
      profile: profileWith({}),
      transactions: normalizeTransactions(
        [big],
        [{ transactionId: "costco", category: "groceries", correctedAt: NOW }],
      ),
      obligations: [],
      accounts,
      baseline: b,
      scoringPeriod: FULL_MONTH,
      policy,
    });
    expect(fixed.components.spending.earned).toBeGreaterThan(
      wrong.components.spending.earned,
    );
    expect(fixed.components.spending.earned).toBe(35);
  });
});

describe("end-to-end with the Nessie-shaped demo personas", () => {
  for (const spec of PERSONAS) {
    it(`${spec.firstName}: produces a deterministic, explained provisional score`, () => {
      const data = nessieToProviderData(
        generatePersonaBundle(spec, "2026-11-07"),
        "seed",
      );
      const r1 = runFinancePipeline({ data, asOf: "2026-11-07", now: NOW });
      const r2 = runFinancePipeline({ data, asOf: "2026-11-07", now: NOW });
      expect(r1.score).toEqual(r2.score);
      expect(r1.baseline.status).toBe("locked");
      expect(r1.score.status).toBe("provisional");
      expect(r1.score.efficiencyPct).toBeGreaterThan(0);
      expect(r1.score.efficiencyPct).toBeLessThanOrEqual(100);
      expect(r1.score.explanations.length).toBeGreaterThan(2);
    });
  }

  it("reuses a locked baseline even if the profile later changes", () => {
    const data = nessieToProviderData(
      generatePersonaBundle(PERSONAS[0], "2026-11-07"),
      "seed",
    );
    const first = runFinancePipeline({ data, asOf: "2026-11-07", now: NOW });
    const later = runFinancePipeline({
      data,
      asOf: "2026-11-07",
      now: NOW,
      confirmations: {
        extraMonthlyObligations: [
          { label: "Car insurance", amountCents: 20_000 },
        ],
      },
      lockedBaseline: first.baseline,
    });
    expect(later.baseline).toBe(first.baseline);
    expect(later.profile.essentialMonthlyExpensesCents).toBeGreaterThan(
      first.profile.essentialMonthlyExpensesCents!,
    );
  });
});

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { bubbleFills, FiveBubbleMeter } from "../src/app/MatchupTickets";
import { RaceCar, raceProgress } from "../src/app/RaceMatchups";
import {
  contributionSegments,
  rankMovement,
} from "../src/lib/competition/presentation";
import { ContributionPie } from "../src/app/ContributionPie";
import { buildLeague } from "../src/lib/competition/demo";
import type { FinanceState } from "../src/app/useFinance";

describe("five-bubble scoring display", () => {
  it("shows full, partial and empty 20% steps from earned / available", () => {
    expect(bubbleFills(75, 100)).toEqual([1, 1, 1, 0.75, 0]);
    expect(bubbleFills(0, 100)).toEqual([0, 0, 0, 0, 0]);
    expect(bubbleFills(100, 100)).toEqual([1, 1, 1, 1, 1]);
    expect(bubbleFills(200, 100)).toEqual([1, 1, 1, 1, 1]);
    expect(bubbleFills(0, 0)).toEqual([0, 0, 0, 0, 0]);
    expect(bubbleFills(-10, 100)).toEqual([0, 0, 0, 0, 0]);
  });
  it("announces ineligibility instead of an invented percentage", () => {
    const html = renderToStaticMarkup(
      <FiveBubbleMeter earned={0} maximum={0} />,
    );
    expect(html).toContain('aria-label="Not scored"');
    expect(html).not.toContain("NaN");
  });
});

describe("race and standings presentation", () => {
  it("clamps race positions including 0, 50, 100 and missing data", () => {
    expect([0, 50, 100, -5, 120, null, NaN].map(raceProgress)).toEqual([
      0, 50, 100, 0, 100, 0, 0,
    ]);
  });
  it("uses the supplied illustrated Formula car, including wings, slicks and number", () => {
    const html = renderToStaticMarkup(<RaceCar number={7} />);
    expect(html).toContain("grand-prix-car");
    expect(html).toContain('viewBox="0 0 180 94"');
    expect(html).toContain("Gold open-wheel race car number 07");
    expect(html).toContain(">07</text>");
  });
  it("derives up, down, unchanged and absent previous movements", () => {
    const prev = [
      { id: "a", rank: 3 },
      { id: "b", rank: 1 },
      { id: "c", rank: 2 },
    ];
    const now = [
      { id: "a", rank: 1 },
      { id: "b", rank: 3 },
      { id: "c", rank: 2 },
    ];
    expect(rankMovement("a", now, prev)).toBe(2);
    expect(rankMovement("b", now, prev)).toBe(-2);
    expect(rankMovement("c", now, prev)).toBe(0);
    expect(rankMovement("a", now, [])).toBeNull();
  });
});

describe("earned-contribution pie", () => {
  it("uses share of earned points independently of category efficiency", () => {
    const segments = contributionSegments([
      { key: "a", earned: 10, available: 10 },
      { key: "b", earned: 10, available: 20 },
    ]);
    expect(segments.map((s) => s.share)).toEqual([50, 50]);
    expect(segments[0].earned / segments[0].available).not.toBe(
      segments[1].earned / segments[1].available,
    );
    expect(segments.reduce((n, s) => n + s.share, 0)).toBe(100);
  });
  it("has no NaN or invisible full-circle slice for empty or single-category states", () => {
    expect(
      contributionSegments([{ key: "a", earned: 0, available: 10 }]),
    ).toEqual([]);
    const one = contributionSegments([
      { key: "a", earned: 10, available: 10 },
    ])[0];
    expect(one.share).toBe(100);
    expect(one.path.match(/ A /g)).toHaveLength(2);
    expect(one.path).not.toContain("NaN");
  });
  it("binds the private activity panel to the selected owner’s real period records", () => {
    const p = buildLeague("2026-11-07").periods["2026-11"].maya;
    const f = {
      result: p.result,
      data: { accounts: p.input.accounts },
      month: "2026-11",
      asOf: "2026-11-07",
    } as FinanceState;
    const html = renderToStaticMarkup(<ContributionPie f={f} />);
    expect(html).toContain("Torchy");
    expect(html).toContain("Pending · excluded from actual points");
    expect(html).toContain("Starbucks");
    expect(html).not.toContain("Target"); // shopping activity is not in the dining detail
    expect(html).toContain("16.5% of total earned");
  });
});

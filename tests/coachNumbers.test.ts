import { describe, expect, it } from "vitest";
import { unverifiedNumbers, verifiedNumbers } from "../server/coach/numberCheck";

const facts = [
  "Completing your remaining eligible savings target with $45 would earn another 9.4 points.",
  "You're ahead in Dining out (11.7/11.7 against 0.0/11.7).",
  "Current provisional efficiency: 88.2% (70.6 / 80 eligible points).",
];
const verified = verifiedNumbers(facts, { safeAvailableToAllocateCents: 12_345, analysis: { gap: 3.04 } });

describe("coach number check", () => {
  it("accepts numbers quoted from verified facts, in any wording", () => {
    expect(
      unverifiedNumbers(
        "Put $45.00 into savings for +9.4 points. You're at 88.2% (70.6/80), and Dining out is 11.7/11.7.",
        verified,
      ),
    ).toEqual([]);
  });

  it("accepts context values, including cents shown as dollars and rounded decimals", () => {
    expect(unverifiedNumbers("You have $123.45 safe to move; the gap is about 3.0 points.", verified)).toEqual([]);
  });

  it("rejects invented or computed money, percentages and points", () => {
    expect(unverifiedNumbers("Save $50 to gain 12 points and reach 95.5%.", verified)).toEqual([
      "$50",
      "12",
      "95.5%",
    ]);
    // A difference the model computed itself (88.2 - 70.6) is not a verified value.
    expect(unverifiedNumbers("That's 17.6 points of headroom.", verified)).toEqual(["17.6"]);
  });

  it("allows small counts, days of the month and years used as plain words", () => {
    expect(unverifiedNumbers("Two of your 3 categories improved by November 15, 2026.", verified)).toEqual([]);
  });

  it("does not let a small number through when it's used as points or a percentage", () => {
    expect(unverifiedNumbers("You'd earn 7 points, a 5 percent jump.", verified)).toEqual(["7", "5"]);
  });
});

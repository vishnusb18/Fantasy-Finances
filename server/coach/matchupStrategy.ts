import type { ExplanationCatalog, VerifiedFact } from "./verifiedExplanation";
import type { VerifiedMatchupAnalysis } from "./matchupAnalysis";
import { formatCents, formatScoreValue } from "../../src/lib/finance/util";

const join = (items: string[]) =>
  items.length < 2
    ? (items[0] ?? "")
    : items.length === 2
      ? items.join(" and ")
      : `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
const ratio = (earned: number | null, max: number | null) =>
  `${formatScoreValue(earned!)}/${formatScoreValue(max!)}`;
const firstName = (name: string | null) =>
  name?.trim().split(/\s+/)[0] || "Your opponent";

export function nextActionText(a: VerifiedMatchupAnalysis): string {
  const action = a.bestNextAction;
  if (action) {
    const money = formatCents(action.amountCents),
      gain = formatScoreValue(action.rawPointGain);
    if (action.action === "pay_due_bill")
      return `Your best next move is to pay the ${money} bill already due. Other bills and your cash buffer stay covered in the preview; this payment would earn another ${gain} points.`;
    const target = action.action === "save" ? "savings" : "investing";
    const risk =
      action.action === "invest"
        ? " Stick to funds already planned for long-term investing."
        : "";
    return `Your best next move is ${target}, using cash left after bills and your reserve.${risk} ${action.completesTarget ? `Completing your remaining eligible ${target} target with ${money}` : `Contributing ${money} to ${target}`} would earn another ${gain} points.`;
  }
  switch (a.nextActionState) {
    case "historical":
      return "This month is closed, so new moves cannot add points to this matchup. Use the category results to plan next month rather than trying to change a finished score.";
    case "baseline_missing":
      return "I need your locked baseline before I can verify a funded scoring move. There isn't a confirmed action or point gain to recommend from the available information yet.";
    case "no_safe_funds":
      return "Your available cash is already needed for bills and your safety reserve. Don't move that money for points; there isn't a verified affordable gain to recommend right now.";
    case "financial_info_missing":
      return "Your cash or bill information is incomplete, so I can't verify a funded scoring move yet. Confirm that information before allocating money; there's no reliable point gain to quote now.";
    default:
      return a.categories.some(
        (c) =>
          c.lostPoints !== null &&
          c.lostPoints > 0 &&
          !["savings", "investing", "bills"].includes(c.key),
      )
        ? "There's no verified move to win back those spending deductions now. Keep your remaining budgets intact; an extra deposit or purchase isn't a proven way to earn those points back."
        : "There's no suitable score-raising move I can verify right now. Keep your existing points intact; extra transfers and purchases only help if the simulator confirms a gain.";
  }
}

/** Three concise sections, with wording choices grounded in the same verified rankings and best action. */
export function strategyCatalog(
  a: VerifiedMatchupAnalysis,
): ExplanationCatalog {
  const name = firstName(a.opponentName),
    gaps = a.categoryGaps.slice(0, 3),
    strongest = gaps.slice(0, 2);
  let gapText: string, strengthText: string;
  if (a.comparisonState === "opponent_missing") {
    gapText =
      "I don't have a published opponent snapshot for this month, so I can't identify a head-to-head category gap yet.";
    strengthText =
      "Your next move can still be based on your own verified scoring opportunities, without guessing anything about the opponent.";
  } else if (a.comparisonState === "no_comparable_positions") {
    gapText =
      "There isn't enough comparable category data to identify where you're trailing yet. A missing or unscored position doesn't count as a zero.";
    strengthText = `I can't establish a category edge for ${name} from these results. Focus on a move supported by your own scoring data.`;
  } else if (gaps.length) {
    gapText = `Your biggest gaps are ${join(gaps.map((g) => `${g.name} (${formatScoreValue(g.performanceGapPoints)} points off their pace)`))}. Those deficits aren't automatically recoverable; focus on verified opportunities.`;
    strengthText = `${name} ${a.opponentAllPublishedPositionsMaxed ? "is maxed in every published scored position" : "has the stronger results here"}: ${strongest.map((g) => `${g.name} ${ratio(g.opponent.earnedPoints, g.opponent.maxEligiblePoints)} versus your ${ratio(g.user.earnedPoints, g.user.maxEligiblePoints)}`).join("; ")}.`;
  } else {
    gapText =
      "You're not behind in any comparable category. The next play is to add eligible points while keeping the positions you're already leading intact.";
    const leading = a.categories
      .filter(
        (c) =>
          c.user.state === "scored" &&
          c.opponent.state === "scored" &&
          c.user.fraction! > c.opponent.fraction!,
      )
      .slice(0, 2);
    strengthText = leading.length
      ? `${name} has no verified category edge here. You're ahead in ${join(leading.map((c) => `${c.name} (${ratio(c.user.earnedPoints, c.user.maxEligiblePoints)} against ${ratio(c.opponent.earnedPoints, c.opponent.maxEligiblePoints)})`))}. Those points are already doing their job; target a verified opportunity elsewhere.`
      : `${name} isn't outperforming you in any comparable position; you're level on those category results. ${a.opponentAllPublishedPositionsMaxed ? "Those published positions are already maxed, so neither side has a weak one there." : "A point-earning move matters more than picking an arbitrary weakest category."}`;
  }
  const action = nextActionText(a);
  const facts: VerifiedFact[] = [
    {
      id: "strategy.gaps.direct",
      text: gapText,
      kind: "explanation",
      section: "gaps",
    },
    {
      id: "strategy.gaps.competitive",
      text: gapText
        .replace("Your biggest gaps are", `You're losing ground in`)
        .replace(
          "You're not behind in any comparable category.",
          "You're holding your own across the comparable categories.",
        ),
      kind: "explanation",
      section: "gaps",
    },
    {
      id: "strategy.strengths.direct",
      text: strengthText,
      kind: "explanation",
      section: "strengths",
    },
    {
      id: "strategy.action.best",
      text: action,
      kind: "recommendation",
      section: "action",
    },
  ];
  return { mode: "strategy", mandatory: [], facts };
}

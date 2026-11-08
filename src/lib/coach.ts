export type CoachTurn = { role: "user" | "assistant"; content: string };
export type CoachRequest = {
  message: string;
  history?: CoachTurn[];
  monthId: string;
  expectedPlayerKey?: string;
};
export type CoachResponse = {
  status: "ok";
  completion: "complete";
  text: string;
  monthId: string;
  model: string;
  contextStatus: string;
};
export type CoachScore = {
  efficiencyPercent: number | null;
  earnedPoints: number;
  eligiblePoints: number;
};
/** All amounts are integer cents; all scores originate in the existing engine. */
export type CoachScenario = {
  id: string;
  action: "save" | "invest" | "pay_due_bill";
  amountCents: number;
  feasible: boolean;
  status: "hypothetical" | "unavailable";
  verification: "existing_scoring_engine";
  current: CoachScore;
  baselineForecast: CoachScore | null;
  hypotheticalCurrent: CoachScore | null;
  hypotheticalForecast: CoachScore | null;
  rawEarnedPointDelta: number | null;
  percentagePointDelta: number | null;
  projectedRawPointDelta: number | null;
  projectedPercentagePointDelta: number | null;
  category: {
    key: string;
    eligible: boolean;
    beforePoints: number;
    afterPoints: number | null;
    afterEligible?: boolean;
    afterAvailablePoints?: number;
    availablePoints: number;
    remainingCapacityPoints: number;
    remainingTargetCents: number | null;
  };
  reason?: string;
};
export const COACH_MAX_MESSAGE = 1200;
export const COACH_MAX_HISTORY = 12;
export const COACH_MAX_ANSWER = 32000;
export const COACH_REQUEST_TIMEOUT = 65000;
/** Keep complete turns rather than silently cutting earlier assistant explanations. */
export function boundedCoachHistory(turns: CoachTurn[]): CoachTurn[] {
  const result: CoachTurn[] = [];
  const encoder = new TextEncoder();
  for (const turn of turns.slice(-COACH_MAX_HISTORY).reverse()) {
    if (encoder.encode(JSON.stringify([turn, ...result])).length > 14000) break;
    result.unshift(turn);
  }
  return result;
}

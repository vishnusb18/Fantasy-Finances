export type CoachTurn = { role: "user" | "assistant"; content: string };
export type CoachRequest = {
  message: string;
  history?: CoachTurn[];
  monthId: string;
  expectedPlayerKey?: string;
};
export type CoachResponse = {
  status: "ok";
  text: string;
  monthId: string;
  model: string;
  contextStatus: string;
};
export const COACH_MAX_MESSAGE = 1200;
export const COACH_MAX_HISTORY = 12;

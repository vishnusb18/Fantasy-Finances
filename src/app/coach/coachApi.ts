import { readToken } from "../spacetime";
import type { CoachRequest, CoachResponse } from "../../lib/coach";
import { COACH_MAX_ANSWER } from "../../lib/coach";
export async function askCoach(
  request: CoachRequest & { requestId: string },
  signal: AbortSignal,
): Promise<CoachResponse> {
  const token = readToken();
  if (!token) throw new Error("Connect to SpacetimeDB before asking Drifblim.");
  const response = await fetch("/api/coach/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(request),
    signal,
  });
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(
      "The coach endpoint is unavailable. Check the local server and retry.",
    );
  }
  if (!body || !response.ok || body.status !== "ok")
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : "Drifblim couldn't complete an answer. Please retry.",
    );
  if (body.completion !== "complete")
    throw new Error(
      "The answer was interrupted before completion. Retry your saved question.",
    );
  if (
    typeof body.text !== "string" ||
    !body.text.trim() ||
    body.text.length > COACH_MAX_ANSWER ||
    body.monthId !== request.monthId
  )
    throw new Error("Coach context changed. Please ask again.");
  return body as CoachResponse;
}

import { useEffect, useRef, useState } from "react";
import type { CoachTurn, CoachRequest } from "../../lib/coach";
import {
  COACH_MAX_MESSAGE,
  COACH_REQUEST_TIMEOUT,
  boundedCoachHistory,
} from "../../lib/coach";
import { askCoach } from "./coachApi";
export type CoachScope = {
  month: string;
  playerKey: string;
  source: "nessie" | "sample";
  connected: boolean;
};
type Thread = {
  messages: CoachTurn[];
  draft: string;
  error: string | null;
  failedQuestion?: string;
  requestId?: string;
  failedRequest?: CoachRequest & { requestId: string };
};
const empty: Thread = { messages: [], draft: "", error: null };
export function useCoachConversation(scope: CoachScope) {
  const key = `${scope.source}:${scope.playerKey}:${scope.month}`;
  const [threads, setThreads] = useState<Record<string, Thread>>({});
  const [pending, setPending] = useState<string | null>(null);
  const flight = useRef<{ key: string; controller: AbortController } | null>(
    null,
  );
  const thread = threads[key] ?? empty;
  const update = (change: (t: Thread) => Thread) =>
    setThreads((all) => ({ ...all, [key]: change(all[key] ?? empty) }));
  useEffect(() => {
    if (flight.current && flight.current.key !== key) {
      flight.current.controller.abort();
      flight.current = null;
      setPending(null);
    }
  }, [key]);
  useEffect(() => () => flight.current?.controller.abort(), []);
  const send = async (question = thread.draft, retry = false) => {
    const message = question.trim();
    if (!message || message.length > COACH_MAX_MESSAGE || flight.current)
      return;
    const sameQuestion =
      retry || (thread.failedQuestion === message && !!thread.failedRequest);
    const request =
      sameQuestion && thread.failedRequest
        ? thread.failedRequest
        : {
            message,
            history: boundedCoachHistory(thread.messages),
            monthId: scope.month,
            expectedPlayerKey: scope.playerKey,
            requestId: crypto.randomUUID(),
          };
    update((t) => ({
      ...t,
      messages: sameQuestion
        ? t.messages
        : ([...t.messages, { role: "user", content: message }].slice(
            -24,
          ) as CoachTurn[]),
      draft: "",
      error: null,
      failedQuestion: undefined,
      requestId: request.requestId,
      failedRequest: undefined,
    }));
    const controller = new AbortController();
    flight.current = { key, controller };
    setPending(key);
    const timeout = setTimeout(() => controller.abort(), COACH_REQUEST_TIMEOUT);
    try {
      if (scope.source !== "nessie")
        throw new Error(
          "Switch to Nessie (live) to use verified financial coaching.",
        );
      if (!scope.connected)
        throw new Error(
          "SpacetimeDB is disconnected. Reconnect your league, then retry your saved question.",
        );
      const answer = await askCoach(request, controller.signal);
      if (controller.signal.aborted) throw new Error("Request interrupted");
      update((t) => ({
        ...t,
        messages: [
          ...t.messages,
          { role: "assistant", content: answer.text },
        ].slice(-24) as CoachTurn[],
        error: null,
        failedQuestion: undefined,
        failedRequest: undefined,
      }));
    } catch (e) {
      update((t) => ({
        ...t,
        draft: message,
        error: controller.signal.aborted
          ? "The request timed out or context changed. Your question is saved; retry when ready."
          : e instanceof Error
            ? e.message
            : "Drifblim couldn't connect. Please retry.",
        failedQuestion: message,
        failedRequest: request,
      }));
    } finally {
      clearTimeout(timeout);
      if (flight.current?.controller === controller) {
        flight.current = null;
        setPending(null);
      }
    }
  };
  return {
    thread,
    loading: pending === key,
    setDraft: (draft: string) =>
      update((t) => ({ ...t, draft: draft.slice(0, COACH_MAX_MESSAGE) })),
    send,
    retry: () => send(thread.failedQuestion, true),
  };
}

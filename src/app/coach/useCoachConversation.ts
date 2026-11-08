import { useEffect, useRef, useState } from "react";
import type { CoachTurn } from "../../lib/coach";
import { COACH_MAX_MESSAGE } from "../../lib/coach";
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
    const requestId =
      retry && thread.requestId ? thread.requestId : crypto.randomUUID();
    const history = retry ? thread.messages.slice(0, -1) : thread.messages;
    update((t) => ({
      ...t,
      messages: retry
        ? t.messages
        : ([...t.messages, { role: "user", content: message }].slice(
            -24,
          ) as CoachTurn[]),
      draft: "",
      error: null,
      failedQuestion: undefined,
      requestId,
    }));
    const controller = new AbortController();
    flight.current = { key, controller };
    setPending(key);
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      if (scope.source !== "nessie")
        throw new Error(
          "Switch to Nessie (live) to use verified financial coaching.",
        );
      if (!scope.connected)
        throw new Error(
          "SpacetimeDB is disconnected. Reconnect your league, then retry your saved question.",
        );
      const answer = await askCoach(
        {
          message,
          history: history.slice(-12),
          monthId: scope.month,
          expectedPlayerKey: scope.playerKey,
          requestId,
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      update((t) => ({
        ...t,
        messages: [
          ...t.messages,
          { role: "assistant", content: answer.text },
        ].slice(-24) as CoachTurn[],
        error: null,
        failedQuestion: undefined,
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

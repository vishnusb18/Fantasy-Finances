import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CoachMessageList } from "./CoachMessageList";
import { monthTitle } from "../MonthNavigation";
import type { useCoachConversation, CoachScope } from "./useCoachConversation";
export type CoachPhase = "idle" | "opening" | "open" | "closing";
export type FlightOrigin = {
  x: number;
  y: number;
  size: number;
  angle: number;
};
export function DrifblimCoachDialog({
  phase,
  origin,
  reduced,
  conversation,
  scope,
  onReady,
  onClose,
  dialogId,
}: {
  phase: CoachPhase;
  origin: FlightOrigin;
  reduced: boolean;
  conversation: ReturnType<typeof useCoachConversation>;
  scope: CoachScope;
  onReady: () => void;
  onClose: () => void;
  dialogId: string;
}) {
  const panel = useRef<HTMLDivElement>(null),
    sprite = useRef<HTMLDivElement>(null),
    input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (phase !== "opening") return;
    if (reduced) {
      onReady();
      return;
    }
    const rect = panel.current?.getBoundingClientRect();
    if (!rect) return;
    const animation = sprite.current?.animate(
      [
        {
          transform: `translate3d(${origin.x}px,${origin.y}px,0) rotate(${origin.angle}deg) scale(${origin.size / 192})`,
          offset: 0,
        },
        {
          transform: `translate3d(${innerWidth / 2 - 96}px,${innerHeight / 2 - 96}px,0) rotate(-3deg) scale(1.2)`,
          offset: 0.62,
        },
        {
          transform: `translate3d(${rect.x + rect.width / 2 - 96}px,${rect.y + 22 - 96}px,0) rotate(0deg) scale(.75)`,
          offset: 1,
        },
      ],
      { duration: 720, easing: "cubic-bezier(.35,.05,.2,1)", fill: "forwards" },
    );
    const timer = setTimeout(onReady, 720);
    return () => {
      clearTimeout(timer);
      animation?.cancel();
    };
  }, [phase, reduced, onReady, origin]);
  useEffect(() => {
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const shell = document.querySelector<HTMLElement>(".app-shell");
    const wasInert = shell?.inert ?? false;
    if (shell) shell.inert = true;
    return () => {
      document.body.style.overflow = old;
      if (shell) shell.inert = wasInert;
    };
  }, []);
  useEffect(() => {
    // Remove the opening-phase focus lock before placing focus in the composer.
    if (panel.current) panel.current.inert = phase !== "open";
    if (phase === "open") input.current?.focus({ preventScroll: true });
  }, [phase, scope.playerKey, scope.month]);
  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || phase !== "open") return;
      const nodes = [
        ...(panel.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
        ) ?? []),
      ];
      const first = nodes[0],
        last = nodes.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keyboard, true);
    return () => document.removeEventListener("keydown", keyboard, true);
  }, [phase, onClose]);
  const { thread, loading, setDraft, send, retry } = conversation;
  return createPortal(
    <div
      className={`coach-overlay is-${phase}${reduced ? " reduced-motion" : ""}`}
    >
      <div className="coach-backdrop" aria-hidden="true" onClick={onClose} />
      {phase === "opening" && !reduced && (
        <div ref={sprite} className="coach-flight" aria-hidden="true">
          <img
            className="coach-flight-moving"
            src="/assets/mascot/shiny-drifblim-floating.png"
            alt=""
          />
          <img
            className="coach-flight-front"
            src="/assets/mascot/shiny-drifblim-front.png"
            alt=""
          />
        </div>
      )}
      <div
        ref={panel}
        className="coach-dialog"
        id={dialogId}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${dialogId}-title`}
      >
        <img
          className="coach-dialog-mascot"
          src="/assets/mascot/shiny-drifblim-front.png"
          alt="Shiny Drifblim"
          width={120}
          height={120}
        />
        <div className="coach-dialog-surface">
          <header className="coach-header">
            <button
              type="button"
              className="coach-close"
              aria-label="Close Drifblim coach"
              onClick={onClose}
            >
              ×
            </button>
            <h2 id={`${dialogId}-title`}>DRIFBLIM</h2>
            <span>MATCHUP COACH</span>
            <small>Gemini powered · {monthTitle(scope.month)}</small>
          </header>
          <CoachMessageList
            messages={thread.messages}
            loading={loading}
            onPrompt={(text) => void send(text)}
          />
          {thread.error && (
            <div className="coach-error" role="alert">
              <span>{thread.error}</span>
              <button
                type="button"
                disabled={loading}
                onClick={() => void retry()}
              >
                Retry
              </button>
            </div>
          )}
          <form
            className="coach-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label className="coach-input-label" htmlFor={`${dialogId}-input`}>
              Ask Drifblim
            </label>
            <textarea
              ref={input}
              id={`${dialogId}-input`}
              rows={2}
              maxLength={1200}
              value={thread.draft}
              placeholder="Ask about your next move…"
              disabled={loading}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button
              type="submit"
              disabled={loading || !thread.draft.trim()}
              aria-label="Send question"
            >
              {loading ? "…" : "Send ↗"}
            </button>
            <small>Read-only coaching</small>
          </form>
        </div>
      </div>
    </div>,
    document.body,
  );
}

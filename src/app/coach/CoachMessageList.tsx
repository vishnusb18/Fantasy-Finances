import { useEffect, useRef } from "react";
import type { CoachTurn } from "../../lib/coach";
const prompts = [
  "How can I beat my opponent this month?",
  "Where is my opponent strongest and weakest?",
  "What's my highest-impact financial move?",
  "What if I save another $25?",
];
export function CoachMessageList({
  messages,
  loading,
  onPrompt,
}: {
  messages: CoachTurn[];
  loading: boolean;
  onPrompt: (text: string) => void;
}) {
  const list = useRef<HTMLDivElement>(null),
    nearBottom = useRef(true);
  useEffect(() => {
    if (nearBottom.current && list.current)
      list.current.scrollTop = list.current.scrollHeight;
  }, [messages, loading]);
  return (
    <div
      className="coach-messages"
      ref={list}
      role="log"
      aria-label="Conversation with Drifblim"
      aria-live="polite"
      onScroll={() => {
        const el = list.current;
        if (el)
          nearBottom.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
    >
      {!messages.length ? (
        <div className="coach-empty">
          <p>Let's find your best move this month.</p>
          <div>
            {prompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => {
                  nearBottom.current = true;
                  onPrompt(prompt);
                }}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      ) : (
        messages.map((turn, i) => (
          <article key={i} className={`coach-message is-${turn.role}`}>
            <span className="coach-speaker">
              {turn.role === "user" ? "YOU" : "DRIFBLIM"}
            </span>
            <p>{turn.content}</p>
          </article>
        ))
      )}
      {loading && (
        <div className="coach-thinking" role="status">
          Drifblim is thinking<span aria-hidden="true"> · · ·</span>
        </div>
      )}
    </div>
  );
}

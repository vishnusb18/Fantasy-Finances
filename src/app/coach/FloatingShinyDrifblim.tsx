import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useDrifblimMotion } from "./useDrifblimMotion";
import {
  DrifblimCoachDialog,
  type CoachPhase,
  type FlightOrigin,
} from "./DrifblimCoachDialog";
import { useCoachConversation, type CoachScope } from "./useCoachConversation";
export function FloatingShinyDrifblim({
  ready,
  scope,
}: {
  ready: boolean;
  scope: CoachScope;
}) {
  const home = useRef<HTMLButtonElement>(null),
    area = useRef<HTMLDivElement>(null),
    image = useRef<HTMLImageElement>(null),
    motionNode = useRef<HTMLDivElement>(null),
    closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const [phase, setPhase] = useState<CoachPhase>("idle");
  const [origin, setOrigin] = useState<FlightOrigin>({
    x: 0,
    y: 0,
    size: 192,
    angle: 0,
  });
  const motion = useDrifblimMotion(area, !ready || phase !== "idle");
  const conversation = useCoachConversation(scope);
  const id = useId();
  const onReady = useCallback(() => setPhase("open"), []);
  const close = useCallback(() => {
    setPhase("closing");
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(
      () => {
        setPhase("idle");
        requestAnimationFrame(() =>
          home.current?.focus({ preventScroll: true }),
        );
      },
      motion.reduced ? 0 : 180,
    );
  }, [motion.reduced]);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  const open = () => {
    if (phase !== "idle" || !image.current) return;
    const r = image.current.getBoundingClientRect(),
      size = parseFloat(getComputedStyle(image.current).width),
      matrix = new DOMMatrix(getComputedStyle(motionNode.current!).transform);
    setOrigin({
      x: r.x + r.width / 2 - 96,
      y: r.y + r.height / 2 - 96,
      size,
      angle: (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI,
    });
    setPhase(motion.reduced ? "open" : "opening");
  };
  if (!ready) return null;
  return (
    <>
      <button
        ref={home}
        type="button"
        className={`drifblim-home${phase !== "idle" ? " is-away" : ""}${motion.reduced ? " reduced-motion" : ""}`}
        aria-label="Open Shiny Drifblim financial coach"
        aria-haspopup="dialog"
        aria-expanded={phase !== "idle"}
        aria-controls={phase !== "idle" ? id : undefined}
        disabled={phase !== "idle"}
        onClick={open}
      >
        <div ref={area} className="coach-drift-area">
          <div
            ref={motionNode}
            className="coach-idle-motion"
            style={{ transform: motion.transform }}
          >
            <img
              ref={image}
              className={`coach-idle-sprite${motion.paused ? " is-paused" : ""}`}
              src="/assets/mascot/shiny-drifblim-floating.png"
              alt=""
              width={96}
              height={96}
            />
          </div>
        </div>
        <span className="coach-home-label">
          ASK DRIFBLIM <small>AI COACH</small>
        </span>
      </button>
      {phase !== "idle" && (
        <DrifblimCoachDialog
          phase={phase}
          origin={origin}
          reduced={motion.reduced}
          conversation={conversation}
          scope={scope}
          onReady={onReady}
          onClose={close}
          dialogId={id}
        />
      )}
    </>
  );
}

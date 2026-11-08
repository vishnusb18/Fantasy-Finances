import { useEffect, useRef, useState, type CSSProperties } from "react";
import App from "../App";
import { ATM_REFERENCE, entryGeometry } from "./entryGeometry";
import { SpaceBackground, spaceStars } from "./SpaceBackground";
export const ENTRY_DURATION = 1100;
export const REDUCED_ENTRY_DURATION = 220;
const viewport = () =>
  typeof window === "undefined"
    ? { width: 1440, height: 900 }
    : { width: window.innerWidth, height: window.innerHeight };

export function EntryExperience({
  imageSrc = "/images/atm-landing.png",
}: {
  imageSrc?: string;
}) {
  const [stage, setStage] = useState<"landing" | "entering" | "app">("landing");
  const [size, setSize] = useState(viewport);
  const [image, setImage] = useState({
    width: Number(ATM_REFERENCE.width),
    height: Number(ATM_REFERENCE.height),
    ready: false,
    failed: false,
  });
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const app = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    const resize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setSize(viewport()));
    };
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(motion.matches);
    window.addEventListener("resize", resize);
    motion.addEventListener("change", change);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      motion.removeEventListener("change", change);
    };
  }, []);
  useEffect(() => {
    if (stage !== "entering") return;
    const timer = window.setTimeout(
      () => setStage("app"),
      reduced ? REDUCED_ENTRY_DURATION : ENTRY_DURATION,
    );
    return () => {
      window.clearTimeout(timer);
    };
  }, [stage, reduced]);
  useEffect(() => {
    if (!app.current) return;
    app.current.inert = stage !== "app";
    if (stage === "app") {
      const heading = app.current.querySelector<HTMLElement>(
        ".competition-heading h1, .competition-empty h2",
      );
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    }
  }, [stage]);
  const geometry = entryGeometry(
    size.width,
    size.height,
    image.width,
    image.height,
  );
  const sceneStyle = {
    width: geometry.width,
    height: geometry.height,
    left: geometry.left,
    top: geometry.top,
    transformOrigin: `${ATM_REFERENCE.screenCenter.x * 100}% ${ATM_REFERENCE.screenCenter.y * 100}%`,
    "--entry-zoom": geometry.zoom,
  } as CSSProperties;
  const play = ATM_REFERENCE.play;
  return (
    <div
      className={`entry-experience is-${stage} ${reduced ? "reduced-entry" : ""}`}
    >
      <SpaceBackground />
      {stage !== "app" && (
        <section
          className="atm-landing"
          aria-label="Fantasy Finance entrance"
          aria-busy={(!image.ready && !image.failed) || stage === "entering"}
        >
          <div
            className="atm-ambient"
            style={{ backgroundImage: `url("${imageSrc}")` }}
            aria-hidden="true"
          />
          <div className="atm-scene" style={sceneStyle}>
            <img
              className="atm-reference"
              src={imageSrc}
              alt="A metallic ATM with a starfield display and a red pixelated PLAY button"
              draggable={false}
              fetchPriority="high"
              onLoad={(e) =>
                setImage({
                  width: e.currentTarget.naturalWidth,
                  height: e.currentTarget.naturalHeight,
                  ready: true,
                  failed: false,
                })
              }
              onError={() =>
                setImage((current) => ({ ...current, failed: true }))
              }
            />
            {stage === "entering" && (
              <div
                className="atm-play-dissolve"
                aria-hidden="true"
                style={{
                  left: `${(play.x - 0.038) * 100}%`,
                  top: `${(play.y - 0.045) * 100}%`,
                  width: `${(play.width + 0.076) * 100}%`,
                  height: `${(play.height + 0.09) * 100}%`,
                  backgroundImage: spaceStars,
                  backgroundSize: `${geometry.width}px ${geometry.height}px`,
                }}
              />
            )}
            {image.ready && (
              <button
                className="atm-play-hotspot"
                type="button"
                aria-label="Enter Fantasy Finance"
                disabled={stage !== "landing"}
                onClick={() => setStage("entering")}
                style={{
                  left: `${play.x * 100}%`,
                  top: `${play.y * 100}%`,
                  width: `${play.width * 100}%`,
                  height: `${play.height * 100}%`,
                }}
              />
            )}
          </div>
          {image.failed && (
            <div className="entry-error" role="alert">
              <p>The ATM image could not load.</p>
              <button type="button" onClick={() => window.location.reload()}>
                Reload
              </button>
            </div>
          )}
        </section>
      )}
      {stage !== "landing" && (
        <div ref={app} className="space-app" aria-hidden={stage !== "app"}>
          <App />
        </div>
      )}
      {stage === "entering" && (
        <span className="entry-status" role="status">
          Entering Fantasy Finance
        </span>
      )}
    </div>
  );
}

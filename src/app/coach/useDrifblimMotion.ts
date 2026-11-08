import { useEffect, useState, type RefObject } from "react";
export function driftBounds(width: number, height: number, spriteSize: number) {
  // Alpha bounds of the exact supplied 96×96 sprite: (18,19)–(78,78).
  return {
    x: Math.max(0, Math.min(26, (width - (spriteSize * 60) / 96) / 2 - 10)),
    y: Math.max(0, Math.min(19, (height - (spriteSize * 59) / 96) / 2 - 8)),
  };
}
export function useDrifblimMotion(
  area: RefObject<HTMLDivElement>,
  paused: boolean,
) {
  const [bounds, setBounds] = useState({ x: 0, y: 0 });
  const [target, setTarget] = useState({ x: 0, y: 0, angle: 0 });
  const [hidden, setHidden] = useState(
    () => typeof document !== "undefined" && document.hidden,
  );
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches);
    const visibility = () => setHidden(document.hidden);
    media.addEventListener("change", change);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      media.removeEventListener("change", change);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    const node = area.current;
    if (!node) return;
    const resize = () => {
      const image = node.querySelector("img");
      setBounds(
        driftBounds(
          node.clientWidth,
          node.clientHeight,
          image ? parseFloat(getComputedStyle(image).width) : 192,
        ),
      );
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    return () => observer.disconnect();
  }, [area, paused]);
  useEffect(() => {
    if (paused || hidden || reduced) return;
    let step = 0;
    const directions = [
      [0.8, -0.8],
      [-0.8, 0.6],
      [0.6, 0.8],
      [-0.6, -0.7],
    ];
    const timer = setInterval(() => {
      const [x, y] = directions[step++ % directions.length];
      setTarget({
        x: x * bounds.x,
        y: y * bounds.y,
        angle: (Math.random() - 0.5) * 8,
      });
    }, 2000);
    return () => clearInterval(timer);
  }, [paused, hidden, reduced, bounds]);
  return {
    reduced,
    paused: paused || hidden,
    transform: reduced
      ? "translate3d(0,0,0) rotate(0deg)"
      : `translate3d(${Math.max(-bounds.x, Math.min(bounds.x, target.x))}px, ${Math.max(-bounds.y, Math.min(bounds.y, target.y))}px, 0) rotate(${target.angle}deg)`,
  };
}

// Static, deterministic artwork, independent of financial data and scoring.
// A single local SVG background avoids hundreds of animated DOM nodes.
function starfield() {
  let seed = 73491;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const stars = Array.from({ length: 720 }, () => {
    const x = (random() * 1600).toFixed(1),
      y = (random() * 1000).toFixed(1);
    const r = (0.25 + random() * 0.72).toFixed(2),
      opacity = (0.12 + random() * 0.58).toFixed(2);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="#eee6ff" opacity="${opacity}"/>`;
  }).join("");
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000">${stars}</svg>`)}")`;
}
const stars = starfield();
export function SpaceBackground() {
  return (
    <div className="space-background" aria-hidden="true">
      <div className="space-nebula" />
      <div className="space-stars" style={{ backgroundImage: stars }} />
    </div>
  );
}

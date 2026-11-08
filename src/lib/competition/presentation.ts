/** Movement compares calculated ranks, never inferred from active projections. */
export function rankMovement(
  id: string,
  current: { id: string; rank: number }[],
  previous: { id: string; rank: number }[],
) {
  const now = current.find((r) => r.id === id),
    before = previous.find((r) => r.id === id);
  return now && before ? before.rank - now.rank : null;
}
export function contributionSegments(
  lines: { key: string; earned: number; available: number }[],
) {
  const eligible = lines.filter((l) => l.available > 0 && l.earned > 0);
  const total = eligible.reduce((s, l) => s + l.earned, 0);
  let start = -Math.PI / 2;
  return eligible.map((l) => {
    const angle = (2 * Math.PI * l.earned) / total,
      end = start + angle;
    const x1 = 160 + 118 * Math.cos(start),
      y1 = 160 + 118 * Math.sin(start);
    const x2 = 160 + 118 * Math.cos(end),
      y2 = 160 + 118 * Math.sin(end);
    // Two arcs support a single category owning all points (a full circle).
    const path =
      angle >= Math.PI * 2 - 1e-8
        ? "M 160 42 A 118 118 0 1 1 160 278 A 118 118 0 1 1 160 42 Z"
        : `M 160 160 L ${x1} ${y1} A 118 118 0 ${angle > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`;
    start = end;
    return { ...l, path, share: (100 * l.earned) / total };
  });
}

export const monthTitle = (month: string) =>
  new Date(`${month}-02T12:00:00`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
export function adjacentMonth(
  months: string[],
  selected: string,
  direction: -1 | 1,
) {
  const index = months.indexOf(selected),
    next = index + direction;
  return index >= 0 && next >= 0 && next < months.length ? months[next] : null;
}
export function MonthNavigation({
  months,
  value,
  onChange,
}: {
  months: string[];
  value: string;
  onChange: (month: string) => void;
}) {
  const prev = adjacentMonth(months, value, -1),
    next = adjacentMonth(months, value, 1);
  return (
    <nav className="month-navigation" aria-label="Matchup month">
      <button
        type="button"
        aria-label="Previous month"
        disabled={!prev}
        onClick={() => prev && onChange(prev)}
      >
        ←
      </button>
      <span className="month-title" aria-live="polite" aria-atomic="true">
        {monthTitle(value)}
      </span>
      <button
        type="button"
        aria-label="Next month"
        disabled={!next}
        onClick={() => next && onChange(next)}
      >
        →
      </button>
    </nav>
  );
}

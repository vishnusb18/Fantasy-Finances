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
export function ArrowNavigation({
  options,
  value,
  onChange,
  ariaLabel,
  unit = "month",
  className = "",
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  unit?: "month" | "matchup";
  className?: string;
}) {
  const values = options.map((option) => option.value);
  const prev = adjacentMonth(values, value, -1),
    next = adjacentMonth(values, value, 1);
  return (
    <nav className={`month-navigation ${className}`} aria-label={ariaLabel}>
      <button
        type="button"
        aria-label={`Previous ${unit}`}
        disabled={!prev}
        onClick={() => prev && onChange(prev)}
      >
        ←
      </button>
      <span className="month-title" aria-live="polite" aria-atomic="true">
        {options.find((option) => option.value === value)?.label}
      </span>
      <button
        type="button"
        aria-label={`Next ${unit}`}
        disabled={!next}
        onClick={() => next && onChange(next)}
      >
        →
      </button>
    </nav>
  );
}

export function MonthNavigation({
  months,
  value,
  onChange,
  ariaLabel = "Matchup month",
}: {
  months: string[];
  value: string;
  onChange: (month: string) => void;
  ariaLabel?: string;
}) {
  return (
    <ArrowNavigation
      options={months.map((month) => ({
        value: month,
        label: monthTitle(month),
      }))}
      value={value}
      onChange={onChange}
      ariaLabel={ariaLabel}
    />
  );
}

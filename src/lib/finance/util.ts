// Small pure helpers: dates (YYYY-MM-DD strings, no timezones), money, math.

export const dollarsToCents = (dollars: number): number => Math.round(dollars * 100);

export const formatCents = (cents: number): string => {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toLocaleString('en-US', {
    minimumFractionDigits: abs % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
};

export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Round to one decimal place, used for points and percentages. */
export const round1 = (x: number): number => Math.round(x * 10) / 10;

export const roundDownTo = (cents: number, step: number): number =>
  step <= 1 ? Math.floor(cents) : Math.floor(cents / step) * step;

export const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

export const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

export const monthOf = (isoDate: string): string => isoDate.slice(0, 7);

export const addMonths = (month: string, delta: number): string => {
  const [y, m] = month.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
};

/** The `n` completed months immediately before `month`, oldest first. */
export const previousMonths = (month: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) => addMonths(month, i - n));

export const daysInMonth = (month: string): number => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

export const monthEnd = (month: string): string => `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;

/** Fraction of the month elapsed as of `asOf` (inclusive), clamped to [0, 1]. */
export const elapsedFraction = (month: string, asOf: string): number => {
  if (asOf < `${month}-01`) return 0;
  if (asOf >= monthEnd(month)) return 1;
  const day = Number(asOf.slice(8, 10));
  return day / daysInMonth(month);
};

export const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

export const dayOfMonth = (month: string, day: number): string =>
  `${month}-${String(Math.min(day, daysInMonth(month))).padStart(2, '0')}`;

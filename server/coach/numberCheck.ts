/**
 * Number guard for Drifblim's free-form answers.
 *
 * Gemini writes the reply in its own words, but every financial figure in it
 * must come from the verified facts / context the scoring engine produced.
 * This extracts each number from the reply and rejects any that isn't one of
 * those verified values, so the model can rephrase but can't invent or compute
 * a dollar amount, point value or percentage.
 */

const NUMBER = /\$?\d[\d,]*(?:\.\d+)?%?/g;
/** Rounding tolerance: verified values are shown to one decimal place. */
const TOLERANCE = 0.051;

const parse = (token: string) => Number(token.replace(/[$,%]/g, ""));

/** Every number that appears in the verified facts or context (cents also as dollars). */
export function verifiedNumbers(factTexts: string[], context: unknown): number[] {
  const out = new Set<number>();
  for (const text of factTexts)
    for (const token of text.match(NUMBER) ?? []) {
      const n = parse(token);
      if (Number.isFinite(n)) out.add(n);
    }
  const walk = (value: unknown, key = "") => {
    if (typeof value === "number" && Number.isFinite(value)) {
      out.add(value);
      out.add(Math.round(value * 10) / 10);
      if (/cents$/i.test(key)) out.add(value / 100);
    } else if (Array.isArray(value)) value.forEach((v) => walk(v, key));
    else if (value && typeof value === "object")
      for (const [k, v] of Object.entries(value)) walk(v, k);
  };
  walk(context);
  return [...out];
}

/**
 * Numbers in `answer` that aren't verified. Small bare whole numbers (counts,
 * days of the month) and years are allowed unless they're used as money,
 * percentages or points.
 */
export function unverifiedNumbers(answer: string, verified: number[]): string[] {
  const bad: string[] = [];
  for (const match of answer.matchAll(NUMBER)) {
    const token = match[0];
    const n = parse(token);
    if (!Number.isFinite(n)) continue;
    const after = answer.slice(match.index! + token.length, match.index! + token.length + 24);
    const isMoney = token.startsWith("$");
    const isPercent = token.endsWith("%") || /^\s*(percent|percentage)/i.test(after);
    const isPoints = /^\s*(points?|pts|pp)\b/i.test(after);
    const isWhole = !token.includes(".");
    if (!isMoney && !isPercent && !isPoints && isWhole && (n <= 31 || (n >= 2000 && n <= 2100))) continue;
    if (!verified.some((v) => Math.abs(v - n) < TOLERANCE)) bad.push(token);
  }
  return [...new Set(bad)];
}

import type { FinanceState } from "./useFinance";
import { buildSamplePeriod, MEMBERS } from "../lib/competition/demo";
import { runFinancePipeline } from "../lib/finance/pipeline";
import { calculateEfficiencyScore } from "../lib/finance/scoring";
import type { ScoringBaseline } from "../lib/finance/types";
import { monthEnd, previousMonths } from "../lib/finance/util";

export function financeMonths(f: FinanceState) {
  if (f.source.kind === "sample")
    return [...previousMonths(f.month, 3), f.month];
  if (
    f.data?.source !== "nessie" ||
    f.data.playerId !== `nessie:${f.source.customerId}`
  )
    return [f.month];
  return [
    ...new Set([
      f.month,
      ...(f.data?.transactions ?? []).map((t) => t.occurredAt.slice(0, 7)),
      ...(f.data?.obligations ?? []).map((o) => o.dueDate.slice(0, 7)),
    ]),
  ]
    .filter((m) => m <= f.month)
    .sort();
}
/** Historical views are read-only; current corrections and goals never alter finalized fixtures. */
export function financeMonthView(
  f: FinanceState,
  month: string,
  lockedBaseline?: ScoringBaseline,
): FinanceState {
  const matches =
    f.data &&
    (f.source.kind === "sample"
      ? f.data.playerId === `seed:${f.source.persona}-cust`
      : f.data.source === "nessie" &&
        f.data.playerId === `nessie:${f.source.customerId}`);
  if (!matches)
    return {
      ...f,
      month,
      result: null,
      personal: undefined,
      readOnly: month !== f.month,
    };
  if (month === f.month) return f;
  if (!financeMonths(f).includes(month) || !f.data)
    return { ...f, month, result: null, personal: undefined, readOnly: true };
  let data = f.data;
  let result;
  if (f.source.kind === "sample") {
    const persona = f.source.persona;
    const spec = MEMBERS.find((p) => p.key === persona);
    if (!spec)
      return { ...f, month, result: null, personal: undefined, readOnly: true };
    ({ data, result } = buildSamplePeriod(spec, month, f.asOf));
  } else {
    // Only real provider activity supports a live historical period. No sample fallback.
    const hasRecords =
      data.transactions.some((t) => t.occurredAt.startsWith(month)) ||
      data.obligations.some((o) => o.dueDate.startsWith(month));
    if (!hasRecords)
      return { ...f, month, result: null, personal: undefined, readOnly: true };
    result = runFinancePipeline({
      data,
      asOf: monthEnd(month),
      lockedBaseline,
      overrides: f.overrides.filter((o) =>
        data.transactions.some(
          (t) => t.id === o.transactionId && t.occurredAt.startsWith(month),
        ),
      ),
      now: `${month}-01T00:00:00Z`,
    });
    result = {
      ...result,
      score: calculateEfficiencyScore({
        profile: result.profile,
        transactions: result.transactions,
        baseline: result.baseline,
        accounts: data.accounts,
        obligations: data.obligations,
        scoringPeriod: { month, asOf: f.asOf },
      }),
    };
  }
  return {
    ...f,
    month,
    data,
    result,
    readOnly: true,
    personal: undefined,
    confirmations: {},
    overrides: [],
    correctionsChangeBaseline: false,
    proposed: undefined,
    recategorize: () => {},
    editPersonal: () => {},
    updateConfirmations: () => {},
    applyCorrectionsToBaseline: () => {},
    resetPlayer: () => {},
  };
}

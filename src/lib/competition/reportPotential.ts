import type { monthlyReport } from "./reports";
import { calculateFeasiblePotentialScore } from "./engine";
import { safeToMoveNowCents } from "../finance/affordability";
import { DEFAULT_POLICY } from "../finance/policy";
import {
  inPeriod,
  netCategorySpend,
  netNewSavingsCents,
  netInvestmentContributionsCents,
} from "../finance/normalize";
import { DISCRETIONARY_CATEGORIES } from "../finance/types";
type ReportPlayer = NonNullable<
  ReturnType<typeof monthlyReport>
>["players"][number];
/** Evaluate the existing what-if engine with funds capped by remaining monthly capacity.
 * Only the hypothetical input is constrained. No actual ledger, baseline or outcome changes.
 */
export function defensiblePotential(p: ReportPlayer) {
  const { input, result } = p;
  const capacity = input.baseline.budgetableCapacityCents;
  const checking = input.profile.availableCheckingBalanceCents;
  if (
    !p.potential.sufficientData ||
    capacity === null ||
    checking === null ||
    result.score.status !== "final" ||
    result.score.efficiencyPct === null ||
    input.profile.obligations.some((o) => o.status === "unknown")
  )
    return null;
  const current = input.transactions.filter((t) =>
    inPeriod(t, input.scoringPeriod.month, input.scoringPeriod.asOf),
  );
  const spend = netCategorySpend(current);
  const used =
    DISCRETIONARY_CATEGORIES.reduce((n, c) => n + (spend[c] ?? 0), 0) +
    Math.max(0, netNewSavingsCents(current, input.accounts)) +
    Math.max(0, netInvestmentContributionsCents(current));
  const remaining = Math.max(0, capacity - used);
  const liquid = safeToMoveNowCents(
    input.profile,
    input.policy ?? DEFAULT_POLICY,
  );
  if (liquid === null) return null;
  const safe = Math.max(
    0,
    liquid - (input.profile.reserveAllocationCents ?? 0),
  );
  const restrictedChecking = checking - Math.max(0, safe - remaining);
  const simulation = calculateFeasiblePotentialScore(
    {
      ...input,
      profile: {
        ...input.profile,
        availableCheckingBalanceCents: restrictedChecking,
      },
    },
    result.score,
  );
  const value = simulation.efficiency;
  return value !== null &&
    Number.isFinite(value) &&
    value >= result.score.efficiencyPct - 0.05 &&
    value <= 100
    ? value
    : null;
}

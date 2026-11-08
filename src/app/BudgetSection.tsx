import {
  inPeriod,
  netCategorySpend,
  netInvestmentContributionsCents,
  netNewSavingsCents,
} from "../lib/finance/normalize";
import { categoryLabel } from "../lib/finance/scoring";
import { DISCRETIONARY_CATEGORIES } from "../lib/finance/types";
import { formatCents } from "../lib/finance/util";
import type { FinanceState } from "./useFinance";
import { Bar, Card, Chip, DollarInput, Money } from "./ui";

export function BudgetSection({ f }: { f: FinanceState }) {
  const { baseline, transactions } = f.result!;
  const pb = f.personal;
  const monthTx = transactions.filter((t) => inPeriod(t, f.month, f.asOf));
  const spent = netCategorySpend(monthTx, { includePending: true });
  const saved = netNewSavingsCents(monthTx, f.data!.accounts);

  if (baseline.status === "needs_input") {
    return (
      <Card title="Budget baseline">
        <p className="empty">{baseline.savings.explanation}</p>
      </Card>
    );
  }

  return (
    <Card
      title="Budget"
      subtitle={`Official baseline v${baseline.version} · Locked`}
      actions={
        <Chip tone="info">
          Capacity {formatCents(baseline.budgetableCapacityCents ?? 0)}
        </Chip>
      }
    >
      {!f.readOnly && f.correctionsChangeBaseline && (
        <div className="callout">
          <div>
            <strong>Your corrections change the inputs.</strong> Capacity would
            become {formatCents(f.proposed!.budgetableCapacityCents ?? 0)} (now{" "}
            {formatCents(baseline.budgetableCapacityCents ?? 0)}). Applying
            creates a logged revision (v{baseline.version + 1}).
          </div>
          <button
            className="btn-primary"
            onClick={() =>
              f.applyCorrectionsToBaseline("Player-confirmed data correction")
            }
          >
            Apply as revision
          </button>
        </div>
      )}
      {baseline.revisionReason && (
        <p className="hint">
          Revised: {baseline.revisionReason} (supersedes{" "}
          {baseline.supersedesId?.split("|").pop()}).
        </p>
      )}

      <div className={`budget-grid ${f.readOnly ? "historical-budget" : ""}`}>
        <div className="budget-head">Category</div>
        <div className="budget-head">
          🔒 Official target <span className="hint">(scored)</span>
        </div>
        {!f.readOnly && (
          <div className="budget-head">
            Your goal <span className="hint">(not scored)</span>
          </div>
        )}
        <div className="budget-head">
          Used <span className="hint">(incl. pending)</span>
        </div>

        {DISCRETIONARY_CATEGORIES.map((c) => {
          const line = baseline.discretionary.categories[c];
          const actual = spent[c] ?? 0;
          const mine = pb?.categoryBudgetsCents[c] ?? line.budgetCents;
          return (
            <BudgetRow
              key={c}
              readOnly={f.readOnly}
              label={categoryLabel(c)}
              official={line.eligible ? line.budgetCents : null}
              officialNote={line.eligible ? undefined : "Overall cap only"}
              personal={mine}
              onPersonal={(v) =>
                f.editPersonal({ categoryBudgetsCents: { [c]: v ?? 0 } })
              }
              actual={actual}
              overIsBad
            />
          );
        })}
        <BudgetRow
          readOnly={f.readOnly}
          label="Savings"
          official={
            baseline.savings.eligible ? baseline.savings.targetCents : null
          }
          officialNote="Not scored"
          personal={pb?.savingsGoalCents ?? baseline.savings.targetCents}
          onPersonal={(v) => f.editPersonal({ savingsGoalCents: v ?? 0 })}
          actual={Math.max(0, saved)}
        />
        <BudgetRow
          readOnly={f.readOnly}
          label="Investing"
          official={
            baseline.investing.eligible ? baseline.investing.targetCents : null
          }
          officialNote="Not scored"
          personal={pb?.investingGoalCents ?? baseline.investing.targetCents}
          onPersonal={(v) => f.editPersonal({ investingGoalCents: v ?? 0 })}
          actual={Math.max(0, netInvestmentContributionsCents(monthTx))}
        />
      </div>

      <details className="notes">
        <summary>Baseline details</summary>
        <ul>
          <li>{baseline.discretionary.explanation}</li>
          <li>{baseline.savings.explanation}</li>
          <li>{baseline.investing.explanation}</li>
          <li>{baseline.bills.explanation}</li>
          {baseline.assumptions.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      </details>
    </Card>
  );
}

function BudgetRow(props: {
  readOnly?: boolean;
  label: string;
  official: number | null;
  officialNote?: string;
  personal: number;
  onPersonal: (cents: number | undefined) => void;
  actual: number;
  overIsBad?: boolean;
}) {
  const {
    label,
    official,
    officialNote,
    personal,
    onPersonal,
    actual,
    overIsBad,
  } = props;
  const ref = official ?? personal;
  const tone = overIsBad
    ? actual > ref
      ? "bad"
      : actual > ref * 0.8
        ? "warn"
        : "good"
    : actual >= ref
      ? "good"
      : "info";
  const personalDone = overIsBad
    ? actual <= personal
    : actual >= personal && personal > 0;
  return (
    <>
      <div className="budget-label">{label}</div>
      <div className="budget-official">
        {official == null ? (
          <span className="hint">{officialNote}</span>
        ) : (
          <Money cents={official} />
        )}
      </div>
      {!props.readOnly && (
        <div className="budget-personal">
          {props.readOnly ? (
            <Money cents={personal} />
          ) : (
            <DollarInput
              ariaLabel={`Your ${label} goal`}
              cents={personal}
              onChange={onPersonal}
            />
          )}
          {personalDone && personal > 0 && (
            <span className="tick" title="Personal goal on track">
              ✓
            </span>
          )}
        </div>
      )}
      <div className="budget-actual">
        <Money cents={actual} />
        <Bar value={actual} max={ref || 1} tone={tone} />
      </div>
    </>
  );
}

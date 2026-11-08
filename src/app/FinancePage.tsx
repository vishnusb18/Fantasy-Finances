import { useMemo, useState } from "react";
import type { FinanceState } from "./useFinance";
import type { ScoringBaseline } from "../lib/finance/types";
import { financeMonths, financeMonthView } from "./financeMonth";
import { MonthNavigation } from "./MonthNavigation";
import { ContributionPie } from "./ContributionPie";
import { BudgetSection } from "./BudgetSection";
import { ProfileSection } from "./ProfileSection";
import { ScoreSection } from "./ScoreSection";
import { TransactionsSection } from "./TransactionsSection";
export function FinancePage({ f }: { f: FinanceState }) {
  const [selected, setSelected] = useState("");
  const months = financeMonths(f);
  const month = months.includes(selected) ? selected : f.month;
  const view = useMemo(() => {
    let baseline: ScoringBaseline | undefined;
    try {
      const raw = localStorage.getItem(
        `ff:baseline:${f.data?.playerId}:${month}`,
      );
      if (raw) baseline = JSON.parse(raw);
    } catch {
      /* use the system-generated baseline */
    }
    return financeMonthView(f, month, baseline);
  }, [f, month]);
  const hasActivity =
    !!view.data &&
    (view.data.transactions.some((t) => t.occurredAt.startsWith(month)) ||
      view.data.obligations.some((o) => o.dueDate.startsWith(month)));
  const pending = f.loading || (!!f.data && !f.result);
  return (
    <main className="finance-page">
      <header className="competition-heading">
        <h1>My Finances</h1>
        <MonthNavigation
          months={months}
          value={month}
          onChange={setSelected}
          ariaLabel="Finance month"
        />
      </header>
      {f.source.kind === "nessie" && !__NESSIE_CONFIGURED__ && (
        <section className="card setup">
          <h2>Connect Nessie</h2>
          <details className="notes">
            <summary>Connection setup</summary>
            <p>
              Add <code>NESSIE_API_KEY</code> to <code>.env.local</code> and
              restart the dev server. See <code>.env.example</code>.
            </p>
          </details>
        </section>
      )}
      {f.error && (
        <div className="card error" role="alert">
          {f.error}
        </div>
      )}
      {pending && (
        <div className="card loading" role="status">
          Loading accounts…
        </div>
      )}
      {view.result && hasActivity && !pending ? (
        <>
          <div className="finance-status">
            <span>
              {view.result.score.status === "final"
                ? "Final"
                : view.readOnly
                  ? "Provisional · awaiting settlement"
                  : "Provisional"}
            </span>
            <span>Private</span>
          </div>
          <ContributionPie f={view} />
          <div className="grid finance-foundation">
            <div className="col">
              <BudgetSection f={view} />
              <details className="card score-transparency">
                <summary>How scoring works</summary>
                <ScoreSection f={view} />
              </details>
            </div>
            <div className="col">
              <ProfileSection f={view} />
            </div>
            <div className="full">
              <TransactionsSection f={view} />
            </div>
          </div>
        </>
      ) : (
        !pending &&
        f.data && (
          <section className="card empty">
            No financial activity for this month.
          </section>
        )
      )}
    </main>
  );
}

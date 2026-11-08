import { categoryLabel } from "../lib/finance/scoring";
import type { ComponentKey } from "../lib/finance/types";
import { formatCents, round1 } from "../lib/finance/util";
import type { FinanceState } from "./useFinance";
import { Bar, Card, Chip } from "./ui";

const COMPONENT_LABEL: Record<ComponentKey, string> = {
  spending: "Discretionary spending",
  savings: "Savings progress",
  bills: "Bills & debt",
  investing: "Investing consistency",
  optimization: "Financial optimization",
};

export function ScoreSection({ f }: { f: FinanceState }) {
  const s = f.result!.score;
  const pct = s.efficiencyPct;
  const tone =
    pct == null ? "neutral" : pct >= 80 ? "good" : pct >= 60 ? "warn" : "bad";

  return (
    <Card
      title="Efficiency score"
      subtitle="How well you're managing relative to your own realistic capacity — not income, net worth or market luck."
      actions={
        <Chip tone={s.status === "final" ? "good" : "info"}>
          {s.status === "final" ? "Final" : `Provisional · as of ${s.asOf}`}
        </Chip>
      }
      className="score-card"
    >
      <div className="score-hero">
        <div
          className={`score-ring ring-${tone}`}
          style={{ ["--pct" as string]: `${pct ?? 0}` }}
        >
          <div className="score-num">{pct == null ? "—" : `${pct}%`}</div>
          <div className="score-sub">
            {round1(s.earnedPoints)} / {s.availablePoints} pts
          </div>
        </div>
        <ul className="components">
          {(Object.keys(s.components) as ComponentKey[]).map((k) => {
            const c = s.components[k];
            return (
              <li key={k} className={c.eligible ? "" : "ineligible"}>
                <div className="comp-head">
                  <span>{COMPONENT_LABEL[k]}</span>
                  <span className="comp-pts">
                    {c.eligible
                      ? `${round1(c.earned)} / ${round1(c.available)}`
                      : "Not scored"}
                  </span>
                </div>
                {c.eligible ? (
                  <Bar
                    value={c.earned}
                    max={c.available}
                    tone={
                      c.earned / c.available >= 0.8
                        ? "good"
                        : c.earned / c.available >= 0.5
                          ? "warn"
                          : "bad"
                    }
                  />
                ) : (
                  <p className="hint">{c.explanations[0]}</p>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="why">
        <h3>Why this score</h3>
        <ul>
          {s.explanations.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
        {s.pending.length > 0 && (
          <>
            <h3>Pending</h3>
            <ul className="pending">
              {s.pending.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      {s.categoryLines.length > 0 && (
        <details className="notes">
          <summary>Per-category points</summary>
          <table className="table compact">
            <thead>
              <tr>
                <th>Category</th>
                <th className="num">Spent</th>
                <th className="num">Budget</th>
                <th className="num">Points</th>
              </tr>
            </thead>
            <tbody>
              {s.categoryLines.map((l) => (
                <tr key={l.category}>
                  <td>{categoryLabel(l.category)}</td>
                  <td className="num">
                    {formatCents(l.actualCents)}
                    {l.pendingCents > 0 && (
                      <span className="hint">
                        {" "}
                        ({formatCents(l.pendingCents)} pending)
                      </span>
                    )}
                  </td>
                  <td className="num">
                    {l.eligible ? formatCents(l.budgetCents) : "—"}
                  </td>
                  <td className="num">
                    {l.eligible
                      ? `${round1(l.earned)} / ${round1(l.available)}`
                      : "cap only"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint">
            The five positions share 35 points using fixed category weights.
            Unscored category weights are redistributed proportionally. The
            overall discretionary cap can reduce all position points together;
            pending purchases affect projections only.
          </p>
        </details>
      )}
      <p className="fineprint">
        {s.scoringVersion} · baseline {s.baselineId.split("|").pop()} ·
        deterministic, no AI decides points.
      </p>
    </Card>
  );
}

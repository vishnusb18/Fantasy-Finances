import { categoryLabel } from "../lib/finance/scoring";
import { formatCents, round1 } from "../lib/finance/util";
import type { FinanceState } from "./useFinance";
import { Card, Chip } from "./ui";
import { ScoreColumns } from "./ScoreColumns";

export function ScoreSection({ f }: { f: FinanceState }) {
  const s = f.result!.score;
  const pct = s.efficiencyPct;
  const tone =
    pct == null ? "neutral" : pct >= 80 ? "good" : pct >= 60 ? "warn" : "bad";

  return (
    <Card
      title="Efficiency score"
      actions={
        <Chip tone={s.status === "final" ? "good" : "info"}>
          {s.status === "final" ? "Final" : "Provisional"}
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
        <ScoreColumns components={s.components} />
      </div>

      <details className="notes score-explanation">
        <summary>Score details</summary>
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
      </details>

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
        </details>
      )}
    </Card>
  );
}

import type { monthlyReport } from "../lib/competition/reports";
import { Avatar, playerName } from "./competitionIdentity";
import { defensiblePotential } from "../lib/competition/reportPotential";
export { defensiblePotential } from "../lib/competition/reportPotential";
type Report = NonNullable<ReturnType<typeof monthlyReport>>;
export function PotentialComparison({
  report,
  onMember,
}: {
  report: Report;
  onMember: (id: string) => void;
}) {
  const players = [...report.players].sort(
    (a, b) =>
      (b.result.score.efficiencyPct ?? -1) -
      (a.result.score.efficiencyPct ?? -1),
  );
  return (
    <section
      className="card bench-chart"
      aria-label="Actual versus feasible potential efficiency"
    >
      <div className="section-title">
        <h2>Points left on the bench</h2>
        <div className="chart-legend">
          <span>
            <i className="actual-key" />
            Actual
          </span>
          <span>
            <i className="potential-key" />
            Potential
          </span>
        </div>
      </div>
      <div className="chart-axis" aria-hidden="true">
        {[0, 25, 50, 75, 100].map((n) => (
          <span key={n}>{n}%</span>
        ))}
      </div>
      <div className="comparison-groups">
        {players.map((p) => {
          const actual = p.result.score.efficiencyPct,
            potential = defensiblePotential(p);
          return (
            <div className="comparison-row" key={p.id}>
              <button className="manager-button" onClick={() => onMember(p.id)}>
                <Avatar id={p.id} />
                <strong>{playerName(p.id)}</strong>
              </button>
              <div className="comparison-plot">
                <div className="comparison-labels">
                  <span>Actual {actual?.toFixed(1) ?? "—"}%</span>
                  <span>
                    Potential{" "}
                    {potential === null
                      ? "Unavailable"
                      : `${potential.toFixed(1)}%`}
                  </span>
                </div>
                <svg
                  viewBox="0 0 100 24"
                  preserveAspectRatio="none"
                  role="img"
                  aria-label={`${playerName(p.id)}: actual ${actual === null ? "unavailable" : actual.toFixed(1) + " percent"}; potential ${potential === null ? "unavailable" : potential.toFixed(1) + " percent"}`}
                >
                  <g className="comparison-grid">
                    {[0, 25, 50, 75, 100].map((x) => (
                      <line key={x} x1={x} x2={x} y1="0" y2="24" />
                    ))}
                  </g>
                  <rect
                    className="actual-series"
                    data-series="actual"
                    x="0"
                    y="2"
                    width={actual ?? 0}
                    height="7"
                    rx=".8"
                  />
                  <rect
                    className="potential-series"
                    data-series="potential"
                    x="0"
                    y="15"
                    width={potential ?? 0}
                    height="7"
                    rx=".8"
                  />
                </svg>
              </div>
            </div>
          );
        })}
      </div>
      <details className="chart-help">
        <summary>Potential methodology</summary>
        <p>
          Hypothetical contributions after bills, reserves and existing
          savings/investing, within remaining monthly capacity. No double
          counting or market returns. Official results stay fixed. Unavailable
          means the existing model lacks sufficient data or exceeds these
          constraints. Sample cash balances are snapshots.
        </p>
      </details>
    </section>
  );
}

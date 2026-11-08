import { useEffect, useState } from "react";
import type { FinanceState } from "./useFinance";
import { positions } from "../lib/competition/engine";
import { contributionSegments } from "../lib/competition/presentation";
import { positionLabel } from "./competitionIdentity";
import { inPeriod } from "../lib/finance/normalize";
import { formatCents, formatEfficiency } from "../lib/finance/util";
const pieColors = [
  "#7c4fac",
  "#f8bf48",
  "#f49960",
  "#d997c0",
  "#e3ce7a",
  "#4da390",
  "#6379bd",
  "#ba8e53",
];
export function ContributionPie({ f }: { f: FinanceState }) {
  const [selected, setSelected] = useState("dining_out");
  const eligibleKeys = f.result
    ? positions(f.result.score)
        .filter((p) => p.eligible && p.available > 0)
        .map((p) => p.key)
        .join("|")
    : "";
  useEffect(() => {
    const keys = eligibleKeys ? eligibleKeys.split("|") : [];
    setSelected((current) =>
      keys.includes(current) ? current : (keys[0] ?? ""),
    );
  }, [f.month, f.result?.score.playerId, eligibleKeys]);
  if (!f.result) return null;
  const { score, transactions } = f.result;
  const lines = positions(score).filter((p) => p.eligible && p.available > 0);
  const active = lines.find((l) => l.key === selected) ?? lines[0];
  const segments = contributionSegments(lines);
  const share =
    score.earnedPoints > 0 && active
      ? (active.earned / score.earnedPoints) * 100
      : 0;
  const current = transactions.filter((t) => inPeriod(t, f.month, f.asOf));
  const activity = active
    ? current
        .filter((t) =>
          active.key === "savings"
            ? t.isInternalTransfer &&
              f.data?.accounts.some(
                (a) =>
                  a.type === "savings" &&
                  (a.id === t.accountId || a.id === t.counterpartyAccountId),
              )
            : active.key === "investing"
              ? t.category === "investment_contribution"
              : active.key === "bills"
                ? false
                : t.category === active.key,
        )
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    : [];
  const obligations =
    active?.key === "bills"
      ? f.result.profile.obligations.filter((o) =>
          o.dueDate.startsWith(f.month),
        )
      : [];
  return (
    <section className="fin-grid" aria-label="Your private score contributions">
      <section className="card contribution-panel">
        <div className="section-title">
          <div>
            <h2>Score contributions</h2>
          </div>
        </div>
        <div className="financial-summary">
          <div>
            <strong>{formatEfficiency(score.efficiencyPct)}</strong>
            <p>Efficiency</p>
          </div>
          <span className="chip">
            {score.earnedPoints.toFixed(1)} / {score.availablePoints} earned
            points
          </span>
        </div>
        <div className="pie-wrap">
          <div className="pie-card">
            {segments.length ? (
              <svg
                className="pie-svg"
                viewBox="0 0 320 320"
                role="group"
                aria-label="Each category’s share of earned financial points"
              >
                {segments.map((s) => (
                  <path
                    key={s.key}
                    className={`pie-seg ${active?.key === s.key ? "active" : ""}`}
                    d={s.path}
                    fill={
                      pieColors[
                        positions(score).findIndex((p) => p.key === s.key)
                      ]
                    }
                    tabIndex={0}
                    role="button"
                    aria-pressed={active?.key === s.key}
                    aria-label={`${positionLabel(s.key)}, ${s.earned.toFixed(1)} points, ${s.share.toFixed(1)}% of earned points`}
                    onMouseEnter={() => setSelected(s.key)}
                    onFocus={() => setSelected(s.key)}
                    onClick={() => setSelected(s.key)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected(s.key);
                      }
                    }}
                  />
                ))}
                <circle
                  cx="160"
                  cy="160"
                  r="8"
                  fill="#fff1c4"
                  stroke="#563477"
                  strokeWidth="2"
                  pointerEvents="none"
                />
              </svg>
            ) : (
              <p className="empty">No earned points this month.</p>
            )}
          </div>
          <div className="pie-legend">
            {lines.map((l) => (
              <button
                className={`legend-item ${active?.key === l.key ? "active" : ""}`}
                key={l.key}
                aria-pressed={active?.key === l.key}
                onClick={() => setSelected(l.key)}
                onFocus={() => setSelected(l.key)}
                onMouseEnter={() => setSelected(l.key)}
              >
                <span
                  className="swatch"
                  style={{
                    background:
                      pieColors[
                        positions(score).findIndex((p) => p.key === l.key)
                      ],
                  }}
                />
                <span>
                  <strong>{positionLabel(l.key)}</strong>
                  <small>
                    {l.earned.toFixed(1)} / {l.available.toFixed(1)} pts
                  </small>
                </span>
                <span className="chip">
                  {((l.earned / l.available) * 100).toFixed(1)}%
                </span>
              </button>
            ))}
          </div>
        </div>
        <details className="notes">
          <summary>Chart details</summary>
          <p>
            Pie area shows each category’s share of earned points. Category
            efficiency is earned / available points; ineligible categories have
            no slice.
          </p>
        </details>
      </section>
      <section className="card activity-panel">
        <div className="section-title">
          <div>
            <h2>Activity</h2>
          </div>
        </div>
        {active ? (
          <div className="history" aria-live="polite" aria-atomic="false">
            <h3 className="activity-title">{positionLabel(active.key)}</h3>

            <div className="financial-summary">
              <div>
                <strong>
                  {active.earned.toFixed(1)}{" "}
                  <small>/ {active.available.toFixed(1)} pts</small>
                </strong>
                <p>
                  {((active.earned / active.available) * 100).toFixed(1)}%
                  category efficiency
                </p>
              </div>
              <span className="chip">{share.toFixed(1)}% of total earned</span>
            </div>
            <div className="history-list">
              {activity.map((t) => (
                <article className="history-item" key={t.id}>
                  <div>
                    <strong>
                      {t.merchantName ??
                        t.description ??
                        positionLabel(t.category)}
                    </strong>
                    <span>{formatCents(t.amountCents)}</span>
                  </div>
                  <p>
                    {t.occurredAt} ·{" "}
                    <b>
                      {t.pending
                        ? "Pending · excluded from actual points"
                        : "Posted"}
                    </b>
                    {t.kind === "refund" ? " · Refund" : ""}
                    {t.isInternalTransfer ? " · Net savings transfer" : ""}
                  </p>
                </article>
              ))}
              {obligations.map((o) => (
                <article className="history-item" key={o.id}>
                  <div>
                    <strong>{o.payee}</strong>
                    <span>{formatCents(o.amountCents)}</span>
                  </div>
                  <p>
                    Due {o.dueDate} · {o.status}
                  </p>
                </article>
              ))}
              {!activity.length && !obligations.length && (
                <p className="empty">
                  No activity for this position this month.
                </p>
              )}
            </div>
            <details className="notes">
              <summary>Scoring details</summary>
              <p>{active.explanation}</p>
              <p>
                Posted activity, refunds and net contributions are evaluated
                against the locked baseline. Opening balances and recycled
                transfers earn no points.
              </p>
            </details>
          </div>
        ) : (
          <p className="empty">No eligible categories.</p>
        )}
      </section>
    </section>
  );
}

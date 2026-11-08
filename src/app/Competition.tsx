import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { FinanceState } from "./useFinance";
import {
  buildLeague,
  MEMBERS,
  type DemoLeague,
  type PlayerPeriod,
} from "../lib/competition/demo";
import {
  positions,
  publicScore,
  standings,
  winner,
  type PublicScore,
} from "../lib/competition/engine";
import { monthlyReport } from "../lib/competition/reports";
import {
  netNewSavingsCents,
  netInvestmentContributionsCents,
  inPeriod,
} from "../lib/finance/normalize";
import { categoryLabel } from "../lib/finance/scoring";
import { formatCents, round1 } from "../lib/finance/util";

const colors = [
  "#60d5c5",
  "#a89aff",
  "#e8b875",
  "#81aef8",
  "#e890ad",
  "#a6d58d",
];
const name = (id: string) => {
  const p = MEMBERS.find((p) => p.key === id)!;
  return `${p.firstName} ${p.lastName}`;
};
const team = (id: string) =>
  [
    "The Compounders",
    "Cashflow Kings",
    "Margin Makers",
    "Steady Climbers",
    "The Rainy Days",
    "Future Fund",
  ][MEMBERS.findIndex((p) => p.key === id)];
const label = (key: string) =>
  ({ bills: "Bills & debt", savings: "Savings", investing: "Investing" })[
    key
  ] ?? categoryLabel(key);
const pct = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(1));
const monthName = (m: string) =>
  new Date(`${m}-02T12:00:00`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
export function Avatar({ id }: { id: string }) {
  return (
    <span
      className="avatar"
      style={
        {
          "--player": colors[MEMBERS.findIndex((p) => p.key === id)],
        } as CSSProperties
      }
    >
      {name(id)
        .split(" ")
        .map((n) => n[0])
        .join("")}
    </span>
  );
}
function Meter({
  value,
  color = "var(--good)",
}: {
  value: number;
  color?: string;
}) {
  return (
    <div className="competition-meter">
      <span
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          background: color,
        }}
      />
    </div>
  );
}
function ScoreIdentity({
  id,
  score,
  projection,
  side,
}: {
  id: string;
  score: PublicScore;
  projection?: PublicScore | null;
  side: string;
}) {
  return (
    <div className={`competitor ${side}`}>
      <Avatar id={id} />
      <p className="eyebrow">{team(id)}</p>
      <h2>{name(id)}</h2>
      <p className="score-phase">
        {projection !== undefined
          ? "Month-to-date efficiency"
          : "Final efficiency"}
      </p>
      <div className="big-score">
        {pct(score.efficiency)}
        <span>%</span>
      </div>
      <p className="sub">
        {round1(score.earned)} / {score.available} eligible pts ·{" "}
        {pct(score.efficiency)} / 100
      </p>
      {projection !== undefined && (
        <p className="projection">
          Expected finish{" "}
          <strong>
            {projection
              ? `${pct(projection.efficiency)}%`
              : "Insufficient data"}
          </strong>
        </p>
      )}
    </div>
  );
}

export function Competition({
  f,
  tab,
  onFinances,
}: {
  f: FinanceState;
  tab: string;
  onFinances: () => void;
}) {
  const [selectedMonth, setMonth] = useState("");
  const [matchId, setMatchId] = useState("");
  const [member, setMember] = useState<string | null>(null);
  useEffect(() => {
    if (!member) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMember(null);
      if (event.key !== "Tab") return;
      const controls = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".member-modal button, .member-modal summary",
        ),
      );
      const first = controls[0],
        last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [member]);
  const league = useMemo(
    () =>
      buildLeague(
        f.asOf,
        f.source.kind === "sample" &&
          f.result &&
          f.data &&
          f.data.playerId === `seed:${f.source.persona}-cust`
          ? {
              key: f.source.persona,
              result: f.result,
              input: {
                profile: f.result.profile,
                baseline: f.result.baseline,
                transactions: f.result.transactions,
                accounts: f.data.accounts,
                obligations: f.data.obligations,
                scoringPeriod: { month: f.month, asOf: f.asOf },
              },
            }
          : undefined,
      ),
    [f.asOf, f.source, f.result, f.data, f.month],
  );
  const player = f.source.kind === "sample" ? f.source.persona : MEMBERS[0].key;
  const month = league.months.includes(selectedMonth) ? selectedMonth : f.month;
  const monthMatches = league.matches.filter((m) => m.month === month);
  const match =
    monthMatches.find((m) => m.id === matchId) ??
    monthMatches.find((m) => m.a === player || m.b === player) ??
    monthMatches[0];
  const active = month === f.month;
  const record = standings(
    MEMBERS.map((p) => p.key),
    league.matches,
  );
  const reportMonth = active ? league.months.at(-2)! : month;
  const report = monthlyReport(league, reportMonth);
  if (f.source.kind === "nessie")
    return (
      <section className="card competition-empty">
        <span className="section-symbol">◈</span>
        <h2>No league joined</h2>
        <p>
          Your live financial dashboard is available. The competition demo uses
          a separate, clearly labeled sample league.
        </p>
        <button
          className="btn-primary"
          onClick={() => f.setSource({ kind: "sample", persona: "maya" })}
        >
          Explore sample league
        </button>{" "}
        <button className="btn-secondary" onClick={onFinances}>
          My Finances
        </button>
      </section>
    );
  return (
    <main className="competition">
      <div className="competition-heading">
        <div>
          <p className="eyebrow">
            THE CAMPUS COLLECTIVE{" "}
            <span className="sample-label">SAMPLE LEAGUE</span>
          </p>
          <h1>
            {tab === "Matchup"
              ? "Small moves. Big matchups."
              : tab === "League"
                ? "Every month counts."
                : "Your month, in perspective."}
          </h1>
          <p className="sub">
            {tab === "Matchup"
              ? "Your circumstances. Your targets. An even playing field."
              : tab === "League"
                ? "Six different financial lives. One fair measure of progress."
                : "The wins, the lessons, and the points left on the bench."}
          </p>
        </div>
        <label className="month-picker">
          <span>{tab === "Reports" ? "Report period" : "Matchup period"}</span>
          <select
            aria-label="Competition month"
            value={tab === "Reports" ? reportMonth : month}
            onChange={(e) => {
              setMonth(e.target.value);
              setMatchId("");
            }}
          >
            {league.months
              .filter((m) => tab !== "Reports" || m !== f.month)
              .map((m) => (
                <option key={m} value={m}>
                  {monthName(m)}
                </option>
              ))}
          </select>
        </label>
      </div>
      {tab === "Matchup" && (
        <>
          <div className="matchup-layout">
            <div>
              <div className="section-top">
                <span className={`live-status ${active ? "" : "closed"}`}>
                  <i />
                  {active ? "IN PROGRESS · PROJECTED" : "FINAL RESULT"}
                </span>
                <select
                  aria-label="Select matchup"
                  value={match.id}
                  onChange={(e) => setMatchId(e.target.value)}
                >
                  {monthMatches.map((m) => (
                    <option key={m.id} value={m.id}>
                      {name(m.a)} vs {name(m.b)}
                    </option>
                  ))}
                </select>
              </div>
              <section className="matchup-hero">
                <div className="hero-topline">
                  <span>{monthName(month)}</span>
                  <span>MONTHLY HEAD-TO-HEAD</span>
                </div>
                <div className="competitors">
                  <ScoreIdentity
                    id={match.a}
                    score={match.scores[match.a]}
                    side="home"
                    projection={
                      active
                        ? league.periods[month][match.a].projection.score
                          ? publicScore(
                              league.periods[month][match.a].projection.score!,
                            )
                          : null
                        : undefined
                    }
                  />
                  <div className="versus">VS</div>
                  <ScoreIdentity
                    id={match.b}
                    score={match.scores[match.b]}
                    side="away"
                    projection={
                      active
                        ? league.periods[month][match.b].projection.score
                          ? publicScore(
                              league.periods[month][match.b].projection.score!,
                            )
                          : null
                        : undefined
                    }
                  />
                </div>
                <MatchVerdict
                  league={league}
                  month={month}
                  a={match.a}
                  b={match.b}
                  active={active}
                />
              </section>
              <div className="section-title">
                <div>
                  <p className="eyebrow">YOUR FINANCIAL LINEUP</p>
                  <h2>Eight positions. Every point matters.</h2>
                </div>
                <span className="hint">Tap a position for details</span>
              </div>
              <PositionRows
                a={league.periods[month][match.a]}
                b={league.periods[month][match.b]}
                viewer={player}
                active={active}
              />
            </div>
            <aside className="competition-aside">
              <section className="card">
                <p className="eyebrow">THE LONG GAME</p>
                <h2>League snapshot</h2>
                <p className="hint">Final records · previous three months</p>
                {record.slice(0, 4).map((r) => (
                  <button
                    className={`mini-standing ${r.id === player ? "selected" : ""}`}
                    key={r.id}
                    onClick={() => setMember(r.id)}
                  >
                    <span>{r.rank}</span>
                    <Avatar id={r.id} />
                    <span>
                      <strong>{name(r.id)}</strong>
                      <small>{team(r.id)}</small>
                    </span>
                    <b>
                      {r.wins}–{r.losses}–{r.ties}
                    </b>
                  </button>
                ))}
              </section>
              <section className="card fairness">
                <span className="section-symbol">◎</span>
                <h2>Efficiency is the equalizer.</h2>
                <p>
                  A bigger paycheck doesn’t buy a better score. You compete
                  against your own locked financial baseline.
                </p>
                <button className="link" onClick={onFinances}>
                  Explore your finances →
                </button>
              </section>
              <section className="card">
                <h2>How projections work</h2>
                <p className="hint">
                  {league.periods[month][player].projection.confidence}
                </p>
                <ul className="assumptions">
                  {league.periods[month][player].projection.assumptions.map(
                    (s) => (
                      <li key={s}>{s}</li>
                    ),
                  )}
                </ul>
              </section>
            </aside>
          </div>
        </>
      )}
      {tab === "League" && (
        <>
          <div className="league-banner">
            <span className="league-crest">♜</span>
            <div>
              <p className="eyebrow">2026 SEASON · 6 MEMBERS</p>
              <h2>The Campus Collective</h2>
              <p className="sub">
                Built on better habits. Settled one month at a time.
              </p>
            </div>
            <span className="sample-label">LOCAL DEMO</span>
          </div>
          <section className="card standings">
            <div className="section-title">
              <h2>Season standings</h2>
              <span className="hint">
                Finalized months only · PF / PA use normalized efficiency
              </span>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Manager</th>
                    <th>W–L–T</th>
                    <th>Streak</th>
                    <th className="num">PF</th>
                    <th className="num">PA</th>
                  </tr>
                </thead>
                <tbody>
                  {record.map((r) => (
                    <tr
                      key={r.id}
                      className={r.id === player ? "selected-row" : ""}
                    >
                      <td className="rank">{r.rank}</td>
                      <td>
                        <button
                          className="manager-button"
                          onClick={() => setMember(r.id)}
                        >
                          <Avatar id={r.id} />
                          <span>
                            <strong>
                              {name(r.id)}{" "}
                              {r.id === player && (
                                <small className="you">YOU</small>
                              )}
                            </strong>
                            <small>{team(r.id)}</small>
                          </span>
                        </button>
                      </td>
                      <td>
                        {r.wins}–{r.losses}–{r.ties}
                      </td>
                      <td className={r.streak.endsWith("W") ? "positive" : ""}>
                        {r.streak}
                      </td>
                      <td className="num">{r.pointsFor.toFixed(1)}</td>
                      <td className="num">{r.pointsAgainst.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {active && (
            <section className="card">
              <h2>Live month · provisional leaderboard</h2>
              <p className="hint">
                These month-to-date scores do not change finalized season
                records.
              </p>
              <div className="provisional-list">
                {Object.entries(league.periods[f.month])
                  .sort(
                    ([, a], [, b]) =>
                      (b.result.score.efficiencyPct ?? -1) -
                      (a.result.score.efficiencyPct ?? -1),
                  )
                  .map(([id, p]) => (
                    <button
                      className="mini-standing"
                      key={id}
                      onClick={() => setMember(id)}
                    >
                      <Avatar id={id} />
                      <strong>{name(id)}</strong>
                      <b>{pct(p.result.score.efficiencyPct)}%</b>
                      <small>
                        Projected {pct(p.projection.score?.efficiencyPct)}%
                      </small>
                    </button>
                  ))}
              </div>
            </section>
          )}
          <section className="card">
            <h2>
              {active
                ? "Current matchups"
                : `${monthName(month)} · past matchups`}
            </h2>
            <MatchCards league={league} month={month} />
          </section>
        </>
      )}
      {tab === "Reports" && report && (
        <>
          <div className="report-banner">
            <p className="eyebrow">
              THE MONTHLY RECAP · FINALIZED SAMPLE RECORDS
            </p>
            <h2>{monthName(reportMonth)}</h2>
            <p>
              Good habits made the difference. Here’s how the month played out.
            </p>
          </div>
          <div className="awards-grid">
            {report.awards.map((a, i) => (
              <button
                className="award-card"
                key={a.title}
                onClick={() => setMember(a.id)}
              >
                <div>
                  <span className="award-icon">
                    {["♜", "◇", "↗", "◎", "↑", "◈"][i]}
                  </span>
                  <p className="eyebrow">{a.title}</p>
                </div>
                <div className="award-person">
                  <Avatar id={a.id} />
                  <span>
                    <strong>{name(a.id)}</strong>
                    <small>{team(a.id)}</small>
                  </span>
                  <b>{a.value}</b>
                </div>
                <p className="hint">{a.why}</p>
              </button>
            ))}
          </div>
          <section className="card">
            <div className="section-title">
              <h2>The matchups</h2>
              <span className="hint">Official final results</span>
            </div>
            <MatchCards league={league} month={reportMonth} />
            <div className="report-facts">
              {report.margins.length > 0 && (
                <>
                  <p>
                    <span>Closest matchup</span>
                    <strong>
                      {name(report.margins[0].match.a)} vs{" "}
                      {name(report.margins[0].match.b)}
                    </strong>
                    <small>
                      {pct(report.margins[0].margin)} normalized points apart
                    </small>
                  </p>
                  <p>
                    <span>Largest margin</span>
                    <strong>{pct(report.margins.at(-1)!.margin)} pts</strong>
                  </p>
                </>
              )}
              {report.losers[0] && (
                <p>
                  <span>Highest efficiency in a loss</span>
                  <strong>{name(report.losers[0])}</strong>
                  <small>
                    {pct(
                      league.periods[reportMonth][report.losers[0]].result.score
                        .efficiencyPct,
                    )}
                    %
                  </small>
                </p>
              )}
            </div>
          </section>
          <section>
            <div className="section-title">
              <div>
                <p className="eyebrow">POSITION LEADERS</p>
                <h2>A strong lineup starts with good habits.</h2>
              </div>
            </div>
            <div className="position-leaders">
              {report.categoryLeaders.map((l) => (
                <button
                  className="position-leader"
                  key={l.position.key}
                  onClick={() => setMember(l.id)}
                >
                  <p className="eyebrow">{label(l.position.key)}</p>
                  <Avatar id={l.id} />
                  <strong>{name(l.id)}</strong>
                  <b>
                    {pct((l.position.earned / l.position.available) * 100)}%
                  </b>
                  <small>
                    {pct(l.position.earned)} / {pct(l.position.available)} pts
                  </small>
                </button>
              ))}
            </div>
          </section>
          <section className="card">
            <div className="section-title">
              <div>
                <p className="eyebrow">ACTUAL VS FEASIBLE WHAT-IF</p>
                <h2>Points left on the bench</h2>
              </div>
              <span className="sample-label">
                HYPOTHETICAL · DOES NOT CHANGE RESULTS
              </span>
            </div>
            <p className="hint">
              Cash after obligations, minimum floor and reserves; savings first,
              then eligible investing. No assumed market returns. Sample account
              balances are fixture snapshots.
            </p>
            {[...report.players]
              .sort(
                (a, b) =>
                  (b.result.score.efficiencyPct ?? 0) -
                  (a.result.score.efficiencyPct ?? 0),
              )
              .map((p) => (
                <div className="potential-row" key={p.id}>
                  <button
                    className="manager-button"
                    onClick={() => setMember(p.id)}
                  >
                    <Avatar id={p.id} />
                    <span>
                      <strong>{name(p.id)}</strong>
                      <small>
                        {round1(p.result.score.earnedPoints)} /{" "}
                        {p.result.score.availablePoints} pts
                      </small>
                    </span>
                  </button>
                  <div>
                    <div className="potential-label">
                      <span>Actual {pct(p.result.score.efficiencyPct)}%</span>
                      <strong>
                        What-if{" "}
                        {p.potential.sufficientData
                          ? `${pct(p.potential.efficiency)}%`
                          : "Insufficient data"}
                      </strong>
                    </div>
                    <Meter
                      value={p.potential.efficiency ?? 0}
                      color="var(--warn)"
                    />
                    <Meter value={p.result.score.efficiencyPct ?? 0} />
                  </div>
                  <b>+{pct(p.potential.gain)} pts</b>
                </div>
              ))}
          </section>
          <PersonalReport
            league={league}
            month={reportMonth}
            player={player}
            onFinances={onFinances}
          />
        </>
      )}
      {tab === "Reports" && !report && (
        <section className="card empty">
          No finalized monthly report yet.
        </section>
      )}
      {member && (
        <div className="modal-backdrop" onClick={() => setMember(null)}>
          <section
            className="member-modal card"
            role="dialog"
            aria-modal="true"
            aria-label={`${name(member)} public performance`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close btn-secondary"
              onClick={() => setMember(null)}
              autoFocus
            >
              Close ×
            </button>
            <Avatar id={member} />
            <h2>{name(member)}</h2>
            <p className="sub">{team(member)} · public competitive metrics</p>
            <p>
              {record.find((r) => r.id === member)?.wins} wins ·{" "}
              {record.find((r) => r.id === member)?.losses} losses
            </p>
            {league.months.map((m) => (
              <details key={m}>
                <summary>
                  {monthName(m)} ·{" "}
                  {pct(league.periods[m][member].result.score.efficiencyPct)}%{" "}
                  {m === f.month ? "provisional" : "final"}
                </summary>
                <div className="public-breakdown">
                  {positions(league.periods[m][member].result.score).map(
                    (p) => (
                      <p key={p.key}>
                        <span>{label(p.key)}</span>
                        <strong>
                          {p.eligible
                            ? `${pct(p.earned)} / ${pct(p.available)} pts`
                            : "Not scored"}
                        </strong>
                      </p>
                    ),
                  )}
                </div>
              </details>
            ))}
          </section>
        </div>
      )}
    </main>
  );
}

function MatchVerdict({
  league,
  month,
  a,
  b,
  active,
}: {
  league: DemoLeague;
  month: string;
  a: string;
  b: string;
  active: boolean;
}) {
  const sa = active
    ? league.periods[month][a].projection.score
    : league.periods[month][a].result.score;
  const sb = active
    ? league.periods[month][b].projection.score
    : league.periods[month][b].result.score;
  const av = sa?.efficiencyPct,
    bv = sb?.efficiencyPct;
  return (
    <div className="match-verdict">
      {av == null || bv == null ? (
        "Insufficient data to project a leader."
      ) : av === bv ? (
        `${active ? "Projected" : "Final"} tie`
      ) : (
        <>
          <span>↗</span> <strong>{name(av > bv ? a : b)}</strong>{" "}
          {active ? "is projected to lead" : "wins"} by{" "}
          <strong>{Math.abs(av - bv).toFixed(1)} pts</strong>
        </>
      )}
      {active && (
        <small>Projection, not an official result or win probability.</small>
      )}
    </div>
  );
}
function PositionRows({
  a,
  b,
  viewer,
  active,
}: {
  a: PlayerPeriod;
  b: PlayerPeriod;
  viewer: string;
  active: boolean;
}) {
  const left = positions(a.result.score),
    right = positions(b.result.score);
  const own = a.spec.key === viewer ? a : b.spec.key === viewer ? b : null;
  return (
    <div className="position-rows">
      {left.map((l, i) => {
        const r = right[i];
        const lp = l.available ? (l.earned / l.available) * 100 : null,
          rp = r.available ? (r.earned / r.available) * 100 : null;
        const ownLine = own ? positions(own.result.score)[i] : null;
        const budget = own?.result.baseline;
        const cat = own?.result.score.categoryLines.find(
          (c) => c.category === l.key,
        );
        const ownProjection = own?.projection.score
          ? positions(own.projection.score)[i]
          : null;
        const leftProjection = a.projection.score
          ? positions(a.projection.score)[i]
          : null;
        const rightProjection = b.projection.score
          ? positions(b.projection.score)[i]
          : null;
        return (
          <details className="position-row" key={l.key}>
            <summary>
              <div
                className={`position-score ${lp != null && rp != null && lp > rp ? "leading" : ""}`}
              >
                <strong>
                  {l.eligible
                    ? `${pct(l.earned)} / ${pct(l.available)}`
                    : "Not scored"}
                </strong>
                <small>
                  {lp === null ? "Ineligible" : `${pct(lp)}% efficiency`}
                </small>
                <Meter value={lp ?? 0} />
                {active && (
                  <small>
                    Projected{" "}
                    {leftProjection?.eligible
                      ? pct(leftProjection.earned) + " pts"
                      : "—"}
                  </small>
                )}
              </div>
              <div className="position-name">
                <span className="position-symbol">
                  {["↗", "☾", "◈", "◇", "↻", "↓", "⌁", "✓"][i]}
                </span>
                <strong>{label(l.key)}</strong>
                <small>
                  {lp != null && rp != null
                    ? lp === rp
                      ? "Even"
                      : `${lp > rp ? a.spec.firstName : b.spec.firstName} leads · ${pct(Math.abs(lp - rp))} pp`
                    : "Eligibility adjusted"}{" "}
                  <span aria-hidden>⌄</span>
                </small>
              </div>
              <div
                className={`position-score right ${lp != null && rp != null && rp > lp ? "leading" : ""}`}
              >
                <strong>
                  {r.eligible
                    ? `${pct(r.earned)} / ${pct(r.available)}`
                    : "Not scored"}
                </strong>
                <small>
                  {rp === null ? "Ineligible" : `${pct(rp)}% efficiency`}
                </small>
                <Meter value={rp ?? 0} color="var(--rival)" />
                {active && (
                  <small>
                    Projected{" "}
                    {rightProjection?.eligible
                      ? pct(rightProjection.earned) + " pts"
                      : "—"}
                  </small>
                )}
              </div>
            </summary>
            <div className="position-detail">
              <p>
                {ownLine?.explanation ??
                  "Public competitive metrics only. Select your own matchup to view private financial details."}
              </p>
              {own && budget && (
                <>
                  <p className="eyebrow">
                    YOUR PRIVATE BREAKDOWN · {name(viewer)}
                  </p>
                  {cat ? (
                    <p>
                      Official target {formatCents(cat.budgetCents)} · posted
                      spending {formatCents(cat.actualCents)} · pending{" "}
                      {formatCents(cat.pendingCents)}.
                    </p>
                  ) : l.key === "savings" || l.key === "investing" ? (
                    <p>
                      Official target {formatCents(budget[l.key].targetCents)} ·
                      verified net contribution{" "}
                      {formatCents(
                        l.key === "savings"
                          ? netNewSavingsCents(
                              own.input.transactions.filter((t) =>
                                inPeriod(
                                  t,
                                  own.input.scoringPeriod.month,
                                  own.input.scoringPeriod.asOf,
                                ),
                              ),
                              own.input.accounts,
                            )
                          : netInvestmentContributionsCents(
                              own.input.transactions.filter((t) =>
                                inPeriod(
                                  t,
                                  own.input.scoringPeriod.month,
                                  own.input.scoringPeriod.asOf,
                                ),
                              ),
                            ),
                      )}
                      . {ownLine?.explanation}
                    </p>
                  ) : (
                    <p>
                      Only obligations due in this period count; upcoming bills
                      are not marked missed.
                    </p>
                  )}
                  <p>
                    {ownLine?.eligible
                      ? `${pct(ownLine.earned)} / ${pct(ownLine.available)} points earned.`
                      : "Not independently scored."}{" "}
                    {active && ownProjection
                      ? `Projected change: ${pct(ownProjection.earned - (ownLine?.earned ?? 0))} pts. Up to ${pct(Math.max(0, (ownLine?.available ?? 0) - (ownLine?.earned ?? 0)))} points remain theoretically available; affordability may limit attainable gains.`
                      : ""}
                  </p>
                </>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
function MatchCards({ league, month }: { league: DemoLeague; month: string }) {
  return (
    <div className="match-cards">
      {league.matches
        .filter((m) => m.month === month)
        .map((m) => (
          <div className="recap-match" key={m.id}>
            {[m.a, m.b].map((id) => (
              <div key={id} className={winner(m) === id ? "match-winner" : ""}>
                <Avatar id={id} />
                <span>
                  <strong>{name(id)}</strong>
                  <small>
                    {winner(m) === id
                      ? "Winner"
                      : m.status === "active"
                        ? "In progress"
                        : winner(m) === null
                          ? "Tie"
                          : "Final"}
                  </small>
                </span>
                <b>
                  {pct(m.scores[id].efficiency)}
                  <small>/ 100</small>
                </b>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
function PersonalReport({
  league,
  month,
  player,
  onFinances,
}: {
  league: DemoLeague;
  month: string;
  player: string;
  onFinances: () => void;
}) {
  const report = monthlyReport(league, month)!;
  const p = report.players.find((p) => p.id === player)!;
  const lines = positions(p.result.score)
    .filter((l) => l.eligible && l.available > 0)
    .sort((a, b) => b.earned / b.available - a.earned / a.available);
  const improvement = report.improvements.find((i) => i.id === player);
  return (
    <section className="card personal-report">
      <div className="section-title">
        <div>
          <p className="eyebrow">YOUR PRIVATE MONTHLY REPORT</p>
          <h2>
            {name(player)} · {monthName(month)}
          </h2>
        </div>
        <Avatar id={player} />
      </div>
      <p>
        You finished at{" "}
        <strong>{pct(p.result.score.efficiencyPct)}% efficiency</strong>.{" "}
        {lines[0] &&
          `${label(lines[0].key)} was your strongest position; ${label(lines.at(-1)!.key)} had the most room to improve.`}{" "}
        {improvement
          ? `You improved ${pct(improvement.delta)} normalized points over last month.`
          : ""}
      </p>
      <div className="public-breakdown">
        {positions(p.result.score).map((l) => (
          <p key={l.key}>
            <span>{label(l.key)}</span>
            <strong>
              {l.eligible
                ? `${pct(l.earned)} / ${pct(l.available)} pts · ${pct((l.earned / l.available) * 100)}%`
                : "Not scored"}
            </strong>
          </p>
        ))}
      </div>
      <h3>Feasible missed opportunities · hypothetical</h3>
      {p.potential.opportunities.length ? (
        p.potential.opportunities.map((o) => (
          <div className="opportunity" key={o.category}>
            <strong>
              {label(o.category)} left on the bench · +{pct(o.points)} pts
            </strong>
            <p>
              {formatCents(o.amountCents)} in additional contributions.{" "}
              {o.explanation}
            </p>
          </div>
        ))
      ) : (
        <p className="hint">
          {p.potential.sufficientData
            ? "No additional affordable contribution opportunities identified under this conservative policy."
            : "Insufficient cash data for a feasible what-if calculation."}
        </p>
      )}
      <button className="link" onClick={onFinances}>
        Review your current finances →
      </button>
    </section>
  );
}

import { useEffect, useMemo, useState } from "react";
import type { FinanceState } from "./useFinance";
import type { LiveLeague } from "./useLiveLeague";
import {
  buildLeague,
  type DemoLeague,
  type PlayerPeriod,
} from "../lib/competition/demo";
import {
  positions,
  publicScore,
  standings,
  winner,
} from "../lib/competition/engine";
import { monthlyReport } from "../lib/competition/reports";
import {
  netNewSavingsCents,
  netInvestmentContributionsCents,
  inPeriod,
} from "../lib/finance/normalize";
import { formatCents } from "../lib/finance/util";

import {
  Avatar,
  playerName as name,
  teamName as team,
  positionLabel as label,
} from "./competitionIdentity";
import { MatchupTicket, PositionTicket } from "./MatchupTickets";
import { MirroredRaceMatchups } from "./RaceMatchups";
import { ArrowNavigation, MonthNavigation } from "./MonthNavigation";
import {
  PotentialComparison,
  defensiblePotential,
} from "./PotentialComparison";
import { rankMovement } from "../lib/competition/presentation";
import { AchievementIcon } from "./AchievementIcon";
import { MakeAMove } from "./MakeAMove";
const pct = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(1));
const monthName = (m: string) =>
  new Date(`${m}-02T12:00:00`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
export function Competition({
  f,
  tab,
  onFinances,
  selectedReportMonth = "",
  onReportMonthChange,
  live,
  onVisibleMonthChange,
}: {
  live?: LiveLeague;
  f: FinanceState;
  tab: string;
  onFinances: () => void;
  selectedReportMonth?: string;
  onReportMonthChange?: (month: string) => void;
  onVisibleMonthChange?: (month: string) => void;
}) {
  const [selectedMonth, setMonth] = useState("");
  const [localReportMonth, setLocalReportMonth] = useState("");
  const [animatePeriod, setAnimatePeriod] = useState(false);
  // Bumped on every month or matchup switch; remounting the position rows
  // replays the bubble animation even when switching quickly.
  const [animateKey, setAnimateKey] = useState(0);
  const replayBubbles = () => {
    setAnimatePeriod(true);
    setAnimateKey((k) => k + 1);
  };
  const changeMonth = (month: string) => {
    setMonth(month);
    setMatchId("");
    replayBubbles();
  };
  const [matchId, setMatchId] = useState("");
  const selectMatch = (id: string) => {
    setMatchId(id);
    replayBubbles();
  };
  const [member, setMember] = useState<string | null>(null);
  useEffect(() => {
    if (!animatePeriod) return;
    const timer = window.setTimeout(() => setAnimatePeriod(false), 650);
    return () => window.clearTimeout(timer);
  }, [animateKey, animatePeriod]);
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
  // Live mode: the league is the Nessie customers who are league members, and
  // "you" are the customer selected in the top bar.
  const isLive = f.source.kind === "nessie";
  const liveReady = isLive && !!live?.ready;
  const ownKey =
    f.source.kind === "sample"
      ? f.source.persona
      : live?.members.find(
          (m) =>
            f.source.kind === "nessie" && m.customerId === f.source.customerId,
        )?.key;
  const ownDataLoaded =
    !!f.data &&
    (f.source.kind === "sample"
      ? f.data.playerId === `seed:${f.source.persona}-cust`
      : f.data.playerId === `nessie:${f.source.customerId}`);
  const league = useMemo(
    () =>
      buildLeague(
        f.asOf,
        ownKey && f.result && f.data && ownDataLoaded
          ? {
              key: ownKey,
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
        liveReady ? live!.data : undefined,
      ),
    [
      f.asOf,
      ownKey,
      ownDataLoaded,
      f.result,
      f.data,
      f.month,
      liveReady,
      live?.data,
    ],
  );
  const player =
    ownKey && league.members.includes(ownKey) ? ownKey : league.members[0];
  const month = league.months.includes(selectedMonth) ? selectedMonth : f.month;
  const monthMatches = league.matches.filter((m) => m.month === month);
  const match =
    monthMatches.find((m) => m.id === matchId) ??
    monthMatches.find((m) => m.a === player || m.b === player) ??
    monthMatches[0];
  const active = month === f.month;
  const record = standings(
    league.members,
    league.matches.filter((m) => m.month <= month),
  );
  const latestFinal = league.matches
    .filter((m) => m.status === "final" && m.month <= month)
    .map((m) => m.month)
    .sort()
    .at(-1);
  const previousRecord =
    latestFinal &&
    league.matches.some((m) => m.status === "final" && m.month < latestFinal)
      ? standings(
          league.members,
          league.matches.filter((m) => m.month < latestFinal),
        )
      : [];
  const reportMonths = league.months.filter((m) => m !== f.month);
  const reportSelection = onReportMonthChange
    ? selectedReportMonth
    : localReportMonth;
  const reportMonth = reportMonths.includes(reportSelection)
    ? reportSelection
    : reportMonths.at(-1)!;
  const report = monthlyReport(league, reportMonth);
  useEffect(() => {
    onVisibleMonthChange?.(tab === "Reports" ? reportMonth : month);
  }, [onVisibleMonthChange, tab, reportMonth, month]);
  if (isLive && !liveReady) {
    const noLeague = !!f.customers && (live?.members.length ?? 0) < 2;
    return (
      <section className="card competition-empty">
        <span className="section-symbol">◈</span>
        <h2>
          {live?.error
            ? "Couldn't load the league"
            : noLeague
              ? "No league joined"
              : "Loading the live league…"}
        </h2>
        <p className="sub">
          {live?.error ??
            (noLeague
              ? "Seed the league members into Nessie (npm run seed:nessie -- --execute) to play live."
              : "Fetching every member's accounts from Nessie.")}
        </p>
        {(noLeague || live?.error) && (
          <>
            <button
              className="btn-primary"
              onClick={() => f.setSource({ kind: "sample", persona: "maya" })}
            >
              Explore sample league
            </button>{" "}
            <button className="btn-secondary" onClick={onFinances}>
              My Finances
            </button>
          </>
        )}
      </section>
    );
  }
  return (
    <main className="competition">
      <div className="competition-heading">
        <div>
          <p className="eyebrow">
            THE CAMPUS COLLECTIVE{" "}
            <span className={`sample-label${league.live ? " live-label" : ""}`}>
              {league.live ? "LIVE · NESSIE" : "SAMPLE LEAGUE"}
            </span>
          </p>
          <div className="matchup-title-row">
            <h1>{tab}</h1>
            {tab === "Matchup" && match && (
              <MakeAMove
                key={`${f.data?.playerId ?? "loading"}:${month}`}
                f={f}
                month={month}
                involvesPlayer={match.a === ownKey || match.b === ownKey}
                opponent={
                  ownKey && (match.a === ownKey || match.b === ownKey)
                    ? {
                        name: name(match.a === ownKey ? match.b : match.a),
                        actual:
                          match.scores[match.a === ownKey ? match.b : match.a]
                            ?.efficiency ?? null,
                        projected:
                          league.periods[month][
                            match.a === ownKey ? match.b : match.a
                          ]?.projection.score?.efficiencyPct ?? null,
                      }
                    : null
                }
              />
            )}
          </div>
        </div>
        {tab === "Reports" && (
          <MonthNavigation
            months={reportMonths}
            value={reportMonth}
            onChange={onReportMonthChange ?? setLocalReportMonth}
            ariaLabel="Report month"
          />
        )}
        {tab === "League" && (
          <label className="month-picker">
            <select
              aria-label="Competition month"
              value={month}
              onChange={(e) => changeMonth(e.target.value)}
            >
              {league.months.map((m) => (
                <option key={m} value={m}>
                  {monthName(m)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {tab === "Matchup" && (
        <>
          <div className="matchup-layout">
            <div>
              <div className="section-top">
                <span className={`live-status ${active ? "" : "closed"}`}>
                  <i />
                  {active ? "Provisional" : "Final"}
                </span>
                <ArrowNavigation
                  ariaLabel="Matchup selection"
                  unit="matchup"
                  className="matchup-navigation"
                  value={match.id}
                  onChange={selectMatch}
                  options={monthMatches.map((m) => ({
                    value: m.id,
                    label: `${name(m.a)} vs ${name(m.b)}`,
                  }))}
                />
              </div>
              <section className="matchup-hero">
                <div className="competitors">
                  <MatchupTicket
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
                  <MatchupTicket
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
              <div className="section-title financial-positions-heading">
                <div>
                  <h2>Financial positions</h2>
                </div>
                <MonthNavigation
                  months={league.months}
                  value={month}
                  onChange={changeMonth}
                />
              </div>
              <PositionRows
                key={animateKey}
                a={league.periods[month][match.a]}
                b={league.periods[month][match.b]}
                viewer={player}
                active={active}
                period={month}
                animate={animatePeriod}
              />
            </div>
            <details className="card scoring-help">
              <summary>How scoring works</summary>
              <p>
                Efficiency = earned eligible points / available points. Opponent
                budgets and transactions stay private.
              </p>
              <p>{league.periods[month][player].projection.confidence}</p>
              <ul>
                {league.periods[month][player].projection.assumptions.map(
                  (s) => (
                    <li key={s}>{s}</li>
                  ),
                )}
              </ul>
            </details>
          </div>
        </>
      )}
      {tab === "League" && (
        <>
          <MirroredRaceMatchups league={league} month={month} />
          <section className="card standings">
            <div className="section-title">
              <h2>Standings</h2>
              <details className="inline-help">
                <summary aria-label="Standings information">ⓘ</summary>
                <p>
                  Finalized results only. PF/PA use normalized efficiency.
                  Movement compares the previous finalized ranking.
                </p>
              </details>
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
                      <td className="rank">
                        {r.rank}
                        <span
                          className={`rank-move ${(rankMovement(r.id, record, previousRecord) ?? 0) > 0 ? "up" : (rankMovement(r.id, record, previousRecord) ?? 0) < 0 ? "down" : "flat"}`}
                          aria-label={
                            rankMovement(r.id, record, previousRecord) === null
                              ? "No previous ranking"
                              : `Rank movement ${rankMovement(r.id, record, previousRecord)}`
                          }
                        >
                          {(rankMovement(r.id, record, previousRecord) ?? 0) > 0
                            ? `↑ ${rankMovement(r.id, record, previousRecord)}`
                            : (rankMovement(r.id, record, previousRecord) ??
                                  0) < 0
                              ? `↓ ${Math.abs(rankMovement(r.id, record, previousRecord)!)}`
                              : "—"}
                        </span>
                      </td>
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
                      <td className="numeric">
                        {r.wins}–{r.losses}–{r.ties}
                      </td>
                      <td
                        className={`numeric ${r.streak.endsWith("W") ? "positive" : ""}`}
                      >
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
              <h2>Provisional standings</h2>

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
        </>
      )}
      {tab === "Reports" && report && (
        <>
          <div className="section-title">
            <h2>League awards</h2>
            <span className="report-status">Final</span>
          </div>
          <div className="awards-grid">
            {report.awards
              .filter(
                (a) =>
                  a.title !== "Points left on the bench" ||
                  defensiblePotential(
                    report.players.find((p) => p.id === a.id)!,
                  ) !== null,
              )
              .map((a) => (
                <button
                  className="award-card achievement-card"
                  key={a.title}
                  onClick={() => setMember(a.id)}
                  title={a.why}
                  aria-label={`${a.title}: ${name(a.id)}, ${a.value}. ${a.why}`}
                >
                  <div className="achievement-header">
                    <AchievementIcon title={a.title} />
                    <p className="eyebrow">{a.title}</p>
                  </div>
                  <div className="award-person">
                    <Avatar id={a.id} />
                    <span>
                      <strong>{name(a.id)}</strong>
                    </span>
                    <b>{a.value}</b>
                  </div>
                </button>
              ))}
          </div>
          <section className="card">
            <div className="section-title">
              <h2>Final matchups</h2>
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
                    <small className="numeric">
                      {pct(report.margins[0].margin)} pts apart
                    </small>
                  </p>
                  <p>
                    <span>Largest margin</span>
                    <strong className="numeric">
                      {pct(report.margins.at(-1)!.margin)} pts
                    </strong>
                  </p>
                </>
              )}
              {report.losers[0] && (
                <p>
                  <span>Highest efficiency in a loss</span>
                  <strong>{name(report.losers[0])}</strong>
                  <small className="numeric">
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
          <PotentialComparison report={report} onMember={setMember} />
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
            <p className="sub">{team(member)} · Public</p>
            <p className="numeric">
              {record.find((r) => r.id === member)?.wins} wins ·{" "}
              {record.find((r) => r.id === member)?.losses} losses
            </p>
            {league.months.map((m) => (
              <details key={m}>
                <summary className="numeric">
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
        "Projection unavailable"
      ) : av === bv ? (
        `${active ? "Projected" : "Final"} tie`
      ) : (
        <>
          <span>↗</span> <strong>{name(av > bv ? a : b)}</strong>{" "}
          {active ? "· Projected lead" : "wins"} ·{" "}
          <strong>{Math.abs(av - bv).toFixed(1)} pts</strong>
        </>
      )}
    </div>
  );
}
function PositionRows({
  a,
  b,
  viewer,
  active,
  period,
  animate,
}: {
  a: PlayerPeriod;
  b: PlayerPeriod;
  viewer: string;
  active: boolean;
  period: string;
  animate: boolean;
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
              <div className="position-heading">
                <h3>{label(l.key)}</h3>
                <span>
                  POSITION{" "}
                  <span className="numeric">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </span>
              </div>
              <div className="position-tickets">
                <PositionTicket
                  id={a.spec.key}
                  position={l}
                  index={i}
                  projected={leftProjection}
                  active={active}
                  period={period}
                  animate={animate}
                />
                <div className="position-between">
                  <strong>VS</strong>
                  <small>
                    {lp != null && rp != null
                      ? lp === rp
                        ? "Tied"
                        : `${lp > rp ? a.spec.firstName : b.spec.firstName} +${pct(Math.abs(lp - rp))} pp`
                      : "Ineligible"}
                  </small>
                </div>
                <PositionTicket
                  id={b.spec.key}
                  position={r}
                  index={i}
                  projected={rightProjection}
                  active={active}
                  period={period}
                  animate={animate}
                />
              </div>
              <div className="row-details">
                <span className="view-scoring">Scoring details ↗</span>
              </div>
            </summary>
            <div className="position-detail">
              <p>
                {ownLine?.explanation ??
                  "Public scores only. Private details are available in your own matchup."}
              </p>
              {own && budget && (
                <>
                  <p className="eyebrow">PRIVATE · {name(viewer)}</p>
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
                      .
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
                      ? `Projected change: ${pct(ownProjection.earned - (ownLine?.earned ?? 0))} pts. Unclaimed: ${pct(Math.max(0, (ownLine?.available ?? 0) - (ownLine?.earned ?? 0)))} pts (theoretical).`
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
                <b className="numeric">
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

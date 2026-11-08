import { formatScoreValue } from "../lib/finance/util";
import type { CSSProperties } from "react";
import type { PublicScore } from "../lib/competition/engine";
import {
  Avatar,
  playerName,
  teamName,
  positionLabel,
} from "./competitionIdentity";

export function bubbleFills(earned: number, maximum: number) {
  const ratio = maximum > 0 ? Math.min(1, Math.max(0, earned / maximum)) : 0;
  return Array.from({ length: 5 }, (_, i) =>
    Math.min(1, Math.max(0, ratio * 5 - i)),
  );
}
export function FiveBubbleMeter({
  earned,
  maximum,
  period,
  animate = false,
}: {
  earned: number;
  maximum: number;
  period?: string;
  animate?: boolean;
}) {
  return (
    <div
      className={`bubble-row ${animate ? "period-ripple" : ""}`}
      key={period}
      data-period={period}
      role="img"
      aria-label={
        maximum > 0
          ? `${((earned / maximum) * 100).toFixed(1)}% efficiency`
          : "Not scored"
      }
    >
      {bubbleFills(earned, maximum).map((fill, i) => (
        <span
          key={i}
          className={`bubble bubble-${i} ${fill === 1 ? "filled" : fill === 0 ? "is-empty" : "partial"}`}
          style={
            {
              "--fill": `${fill * 100}%`,
              "--bubble-delay": `${i * 45}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
export function MatchupTicket({
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
  const best = score.positions
    .filter((p) => p.eligible && p.available > 0)
    .sort((a, b) => b.earned / b.available - a.earned / a.available)[0];
  return (
    <article
      className={`ticket competitor ${side}`}
      aria-label={`${playerName(id)} matchup ticket`}
    >
      <div className="hero-ticket-content">
        <div className="ticket-rail">
          <span>{side === "home" ? "HOME" : "AWAY"} ADMISSION</span>
        </div>
        <div className="ticket-body">
          <div className="ticket-head">
            <div>
              <p className="eyebrow">{teamName(id)}</p>
              <div className="team-id">
                <Avatar id={id} />
                <div>
                  <h2>{playerName(id)}</h2>
                </div>
              </div>
            </div>
            <span className="chip">
              {projection !== undefined ? "Provisional" : "Final"}
            </span>
          </div>
          <div className="scoreline">
            <div>
              <p className="score-phase">
                {projection !== undefined ? "Actual" : "Final efficiency"}
              </p>
              <div className="big-score">
                {score.efficiency == null
                  ? "—"
                  : formatScoreValue(score.efficiency)}
                <span>%</span>
              </div>
              <p className="sub">
                {score.earned.toFixed(1)} / {score.available} eligible pts
              </p>
            </div>
            {projection !== undefined && (
              <div className="expected-score">
                <p className="eyebrow">PROJECTED</p>
                <strong>
                  {projection?.efficiency == null
                    ? "—"
                    : formatScoreValue(projection.efficiency)}
                  <small>{projection?.efficiency != null ? "%" : ""}</small>
                </strong>
                {!projection && <small>Insufficient data</small>}
              </div>
            )}
          </div>
          <div className="stat-stack">
            <div className="mini-stat">
              <span>Best position</span>
              <strong>
                {best
                  ? `${positionLabel(best.key)} · ${((best.earned / best.available) * 100).toFixed(1)}%`
                  : "No eligible positions"}
              </strong>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
export function PositionTicket({
  id,
  position,
  index,
  projected,
  active,
  period,
  animate,
}: {
  id: string;
  position: PublicScore["positions"][number];
  index: number;
  projected?: PublicScore["positions"][number] | null;
  active: boolean;
  period?: string;
  animate?: boolean;
}) {
  return (
    <div
      className="position-ticket"
      aria-label={`${playerName(id)}, ${positionLabel(position.key)}, ${position.eligible ? `${position.earned.toFixed(1)} of ${position.available.toFixed(1)} points` : "not scored"}`}
    >
      <div className="position-ticket-inner">
        <div className="position-rail">
          <span>{String(index + 1).padStart(2, "0")} · POSITION</span>
        </div>
        <div className="position-ticket-body">
          <span className="player-name">{teamName(id)}</span>
          <div className="points">
            {position.eligible ? (
              <>
                {position.earned.toFixed(1)}
                <small> / {position.available.toFixed(1)} pts</small>
              </>
            ) : (
              "Not scored"
            )}
          </div>
          <FiveBubbleMeter
            earned={position.earned}
            maximum={position.available}
            period={period}
            animate={animate}
          />
          <span className="ticket-rate">
            {position.eligible
              ? `${((position.earned / position.available) * 100).toFixed(1)}% efficiency`
              : "Ineligible"}
          </span>
          {active && (
            <small className="position-projected">
              Projected{" "}
              {projected?.eligible ? `${projected.earned.toFixed(1)} pts` : "—"}
            </small>
          )}
        </div>
      </div>
    </div>
  );
}

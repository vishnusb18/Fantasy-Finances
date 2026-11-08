import { useEffect, useState, type CSSProperties } from "react";
import type { DemoLeague } from "../lib/competition/demo";
import { playerName, teamName } from "./competitionIdentity";
import { raceCarArt } from "./raceCarArt";
export const raceProgress = (value: number | null) =>
  Number.isFinite(value) ? Math.min(100, Math.max(0, value ?? 0)) : 0;
export function RaceCar({ number }: { number: number }) {
  return (
    <span
      className="race-art"
      dangerouslySetInnerHTML={{
        __html: raceCarArt(String(number).padStart(2, "0")),
      }}
    />
  );
}
export function RaceLane({
  value,
  number,
  direction,
}: {
  value: number | null;
  number: number;
  direction: "left" | "right";
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let second = 0;
    const frame = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setReady(true));
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(second);
    };
  }, []);
  const progress = ready ? raceProgress(value) : 0;
  return (
    <div
      className={`race-lane ${direction}`}
      data-efficiency={value ?? "unavailable"}
    >
      <div className="car-runway">
        <div
          className="race-car"
          style={{ "--progress": `${progress}%` } as CSSProperties}
        >
          <RaceCar number={number} />
        </div>
      </div>
    </div>
  );
}
export function MirroredRaceMatchups({
  league,
  month,
}: {
  league: DemoLeague;
  month: string;
}) {
  return (
    <section className="current-races">
      <div className="section-title">
        <div>
          <h2>
            {month === league.months.at(-1)
              ? "Current matchups"
              : "Monthly matchups"}
          </h2>
        </div>
      </div>
      <div className="current-matchups">
        {league.matches
          .filter((m) => m.month === month)
          .map((m, i) => {
            const a = m.scores[m.a].efficiency,
              b = m.scores[m.b].efficiency;
            const pa =
                league.periods[month][m.a].projection.score?.efficiencyPct,
              pb = league.periods[month][m.b].projection.score?.efficiencyPct;
            const active = m.status === "active";
            const projection =
              pa == null || pb == null
                ? "Insufficient projection data"
                : pa === pb
                  ? "Projected tie"
                  : `${playerName(pa > pb ? m.a : m.b).split(" ")[0]} projected +${Math.abs(pa - pb).toFixed(1)}`;
            return (
              <article className="race-match" key={m.id}>
                <div className="race-head">
                  <strong>
                    {teamName(m.a)} <span>vs</span> {teamName(m.b)}
                  </strong>
                  <span className="chip">
                    {active ? projection : "Finalized"}
                  </span>
                </div>
                <div className="race-names">
                  <span>{playerName(m.a)}</span>
                  <span>{playerName(m.b)}</span>
                </div>
                <div
                  className="race-arena"
                  aria-label={`${playerName(m.a)} ${a ?? "unavailable"}%, ${playerName(m.b)} ${b ?? "unavailable"}% actual efficiency`}
                >
                  <div className="race-finish" aria-hidden="true" />
                  <RaceLane
                    key={`${month}-${m.a}`}
                    value={a}
                    number={i * 2 + 1}
                    direction="left"
                  />
                  <RaceLane
                    key={`${month}-${m.b}`}
                    value={b}
                    number={i * 2 + 2}
                    direction="right"
                  />
                </div>
                <div className="race-meter">
                  <span>
                    Actual <strong>{a?.toFixed(1) ?? "—"}%</strong>
                  </span>
                  <span>
                    Actual <strong>{b?.toFixed(1) ?? "—"}%</strong>
                  </span>
                </div>
                {active && (
                  <div className="race-projections">
                    <span>Projected {pa?.toFixed(1) ?? "—"}%</span>
                    <span>Projected {pb?.toFixed(1) ?? "—"}%</span>
                  </div>
                )}
                <div className="race-caption">
                  <span>0%</span>
                  <span>100%</span>
                  <span>0%</span>
                </div>
              </article>
            );
          })}
      </div>
    </section>
  );
}

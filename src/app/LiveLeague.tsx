import { useMemo } from "react";
import { categoryLabel } from "../lib/finance/scoring";
import { useCloud, STDB_DB } from "./spacetime";

/**
 * Everyone connected to the same SpacetimeDB database, ranked by the public
 * score summaries they published for this month. Only efficiency and category
 * points are shared — never balances, amounts or transactions.
 */
export function LiveLeague({ month }: { month: string }) {
  const cloud = useCloud();

  const rows = useMemo(() => {
    const onlineOwners = new Set(cloud.online.map((o) => o.owner.toHexString()));
    // One row per player: the latest published score wins.
    const latest = new Map<string, (typeof cloud.scores)[number]>();
    for (const s of cloud.scores) {
      if (s.month !== month || !s.playerKey.startsWith("nessie:")) continue;
      const prev = latest.get(s.playerKey);
      if (!prev || s.updatedAt.microsSinceUnixEpoch > prev.updatedAt.microsSinceUnixEpoch)
        latest.set(s.playerKey, s);
    }
    return [...latest.values()]
      .map((s) => {
        const owner = s.owner.toHexString();
        const player = cloud.leaguePlayers.find(
          (p) => p.owner.toHexString() === owner && p.playerKey === s.playerKey,
        );
        const weakest = [...s.categories]
          .filter((c) => c.eligible && c.available > 0 && c.earned < c.available - 0.05)
          .sort((a, b) => a.earned / a.available - b.earned / b.available)[0];
        return {
          id: `${owner}:${s.playerKey}`,
          name: player?.displayName ?? "Player",
          source: player?.source ?? "",
          mine: owner === cloud.identityHex,
          online: onlineOwners.has(owner),
          pct: s.efficiencyPct ?? null,
          earned: s.earnedPoints,
          available: s.availablePoints,
          status: s.status,
          weakest,
        };
      })
      .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
  }, [cloud.scores, cloud.leaguePlayers, cloud.online, cloud.identityHex, month]);

  if (cloud.status === "disabled") return null;

  return (
    <section className="card standings live-league">
      <div className="section-title">
        <h2>Live league</h2>
        <details className="inline-help">
          <summary aria-label="Live league information">ⓘ</summary>
          <p>
            Real players connected to the <code>{STDB_DB}</code> SpacetimeDB
            database. Each browser publishes its own public score summary
            (efficiency and category points only) and updates appear instantly.
          </p>
        </details>
      </div>
      {cloud.status !== "ready" ? (
        <p className="sub">
          {cloud.status === "connecting"
            ? "Connecting to SpacetimeDB…"
            : "SpacetimeDB is offline — start the server to see the live league. Your data is saved in this browser meanwhile."}
        </p>
      ) : rows.length === 0 ? (
        <p className="sub">
          No scores published for {month} yet. Pick a player in the top bar to
          join.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th className="num">Efficiency</th>
                <th className="num">Points</th>
                <th>Needs work</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className={r.mine ? "selected-row" : ""}>
                  <td className="rank">{i + 1}</td>
                  <td>
                    <strong>
                      <span
                        className={`presence-dot ${r.online ? "on" : ""}`}
                        aria-label={r.online ? "Online" : "Offline"}
                      />
                      {r.name}{" "}
                      {r.mine && <small className="you">YOU</small>}
                    </strong>
                    <small className="sub">
                      {" "}
                      {r.source === "nessie" ? "Nessie" : "Sample"} ·{" "}
                      {r.status}
                    </small>
                  </td>
                  <td className="num">
                    {r.pct === null ? "—" : `${r.pct.toFixed(1)}%`}
                  </td>
                  <td className="num">
                    {r.earned.toFixed(1)} / {r.available.toFixed(1)}
                  </td>
                  <td>{r.weakest ? categoryLabel(r.weakest.category) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const LABEL = {
  disabled: "Local only",
  connecting: "Connecting…",
  ready: "Live · SpacetimeDB",
  offline: "Offline · saved locally",
} as const;

export function CloudStatusPill({
  status,
  error,
}: {
  status: keyof typeof LABEL;
  error: string | null;
}) {
  return (
    <span
      className={`cloud-pill ${status}${error ? " error" : ""}`}
      title={error ?? `SpacetimeDB database: ${STDB_DB}`}
      role="status"
    >
      <span className="presence-dot on" aria-hidden />
      {error ? "Sync error" : LABEL[status]}
    </span>
  );
}

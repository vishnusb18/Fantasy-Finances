/** Read-only public-score inspection. Never claims a player or fetches private bank data. */
import { loadEnv } from "vite";
import { DbConnection, tables } from "../src/module_bindings";
import { monthPairings } from "../src/lib/competition/pairings";
import { MEMBERS } from "../src/lib/competition/demo";
import { previousMonths } from "../src/lib/finance/util";
const env = loadEnv("development", process.cwd(), "");
const month = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "2-digit",
}).format(new Date());
let connection: DbConnection | undefined;
const timer = setTimeout(() => {
  console.log(
    JSON.stringify({
      status: "unavailable",
      reason: "Public subscription timed out",
    }),
  );
  connection?.disconnect();
  process.exitCode = 1;
}, 12000);
connection = DbConnection.builder()
  .withUri(env.VITE_SPACETIMEDB_HOST || "wss://maincloud.spacetimedb.com")
  .withDatabaseName(
    env.VITE_SPACETIMEDB_DB || env.VITE_SPACETIMEDB_DB_NAME || "fantasyfinance",
  )
  .onConnect((conn) =>
    conn
      .subscriptionBuilder()
      .onApplied(() => {
        const players = MEMBERS.flatMap((m) =>
          [...conn.db.leaguePlayer.iter()].filter(
            (p) =>
              p.source === "nessie" &&
              p.displayName === `${m.firstName} ${m.lastName}`,
          ),
        );
        const maya = players.find((p) => p.displayName === "Maya Chen");
        const pair = monthPairings(
          players.map((p) => p.playerKey),
          previousMonths(month, 3).length,
        ).find((p) => p.includes(maya?.playerKey ?? ""));
        const snapshots = pair?.map((playerKey) => {
          const score = [...conn.db.scoreSnapshot.iter()]
            .filter((s) => s.playerKey === playerKey && s.month === month)
            .sort((a, b) =>
              a.updatedAt.microsSinceUnixEpoch >
              b.updatedAt.microsSinceUnixEpoch
                ? -1
                : 1,
            )[0];
          return {
            name: players.find((p) => p.playerKey === playerKey)?.displayName,
            score: score
              ? {
                  efficiencyPct: score.efficiencyPct,
                  earnedPoints: score.earnedPoints,
                  availablePoints: score.availablePoints,
                  categories: score.categories,
                }
              : null,
          };
        });
        console.log(
          JSON.stringify(
            {
              status: "ok",
              source:
                "public SpacetimeDB scores only; no private state or writes",
              month,
              matchup: snapshots ?? [],
            },
            null,
            2,
          ),
        );
        clearTimeout(timer);
        conn.disconnect();
      })
      .onError(() => {
        clearTimeout(timer);
        console.log(
          JSON.stringify({
            status: "unavailable",
            reason: "Public subscription failed",
          }),
        );
        conn.disconnect();
        process.exitCode = 1;
      })
      .subscribe([tables.leaguePlayer, tables.scoreSnapshot]),
  )
  .onConnectError(() => {
    clearTimeout(timer);
    console.log(
      JSON.stringify({
        status: "unavailable",
        reason: "Public connection failed",
      }),
    );
    process.exitCode = 1;
  })
  .build();

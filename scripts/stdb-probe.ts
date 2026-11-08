/**
 * Read-only SpacetimeDB connectivity check: connects like the browser does,
 * subscribes to the same tables/views, and reports what arrives. Calls no
 * reducers and runs no SQL.
 *
 *   npx tsx scripts/stdb-probe.ts [ws://localhost:3000] [fantasyfinance]
 */
import { DbConnection, tables } from "../src/module_bindings";

const uri = process.argv[2] ?? "ws://localhost:3000";
const db = process.argv[3] ?? "fantasyfinance";
const t0 = Date.now();
const log = (m: string, ...rest: unknown[]) =>
  console.log(`[+${Date.now() - t0}ms] ${m}`, ...rest);

const timer = setTimeout(() => {
  log("TIMEOUT after 10s");
  process.exit(1);
}, 10_000);

DbConnection.builder()
  .withUri(uri)
  .withDatabaseName(db)
  .onConnect((conn, identity) => {
    log(`connected as ${identity.toHexString().slice(0, 12)}…`);
    const queries = {
      myMonthState: tables.myMonthState,
      myCategoryOverride: tables.myCategoryOverride,
      myPlayerSettings: tables.myPlayerSettings,
      leaguePlayer: tables.leaguePlayer,
      scoreSnapshot: tables.scoreSnapshot,
      onlinePresence: tables.onlinePresence,
    };
    let pending = Object.keys(queries).length;
    for (const [name, q] of Object.entries(queries)) {
      conn
        .subscriptionBuilder()
        .onApplied(() => {
          log(`subscription applied: ${name}`);
          if (--pending === 0) {
            log(`ALL OK — league_player: ${conn.db.leaguePlayer.count()}, score_snapshot: ${conn.db.scoreSnapshot.count()}, online: ${conn.db.onlinePresence.count()}`);
            for (const p of conn.db.leaguePlayer.iter()) log(`  player ${p.displayName.padEnd(14)} owner ${p.owner.toHexString().slice(0, 10)} joined ${new Date(Number(p.updatedAt.microsSinceUnixEpoch / 1000n)).toLocaleTimeString()}`);
            for (const o of conn.db.onlinePresence.iter()) log(`  online owner ${o.owner.toHexString().slice(0, 10)} x${o.connections}`);
            for (const s of conn.db.scoreSnapshot.iter()) log(`  score ${s.playerKey} ${s.month} ${s.efficiencyPct ?? "-"}% (${s.status})`);
            clearTimeout(timer);
            conn.disconnect();
            setTimeout(() => process.exit(0), 100);
          }
        })
        .onError((ctx) => log(`subscription ERROR ${name}:`, ctx.event))
        .subscribe(q);
    }
  })
  .onConnectError((_ctx, err) => log("connect error:", err))
  .onDisconnect((_ctx, err) => log("disconnected", err ?? ""))
  .build();

import { DbConnection, tables } from "../src/module_bindings";
import type {
  ScoringBaseline,
  PlayerConfirmations,
  CategoryOverride,
} from "../src/lib/finance/types";

export class LeagueSessionError extends Error {
  constructor(
    message: string,
    public status = 403,
  ) {
    super(message);
  }
}
export type PublicLeagueScore = {
  playerKey: string;
  month: string;
  status: string;
  efficiencyPct: number | null;
  earnedPoints: number;
  availablePoints: number;
  categories: {
    category: string;
    earned: number;
    available: number;
    eligible: boolean;
  }[];
  updatedAt: string;
};
export type LeagueSession = {
  identity: string;
  playerKey: string;
  displayName: string;
  baseline?: ScoringBaseline;
  confirmations: PlayerConfirmations;
  overrides: CategoryOverride[];
  players: { playerKey: string; displayName: string; source: string }[];
  scores: PublicLeagueScore[];
  controls: () => boolean;
  connection: DbConnection;
  close: () => void;
};
/** The token is verified by SpacetimeDB; owner-only views determine accessible player state. */
export function openLeagueSession(
  host: string,
  database: string,
  token: string,
  month: string,
  expectedPlayer?: string,
): Promise<LeagueSession> {
  if (!token || token.length > 8192)
    return Promise.reject(
      new LeagueSessionError(
        "Connect to SpacetimeDB to verify your player identity.",
        401,
      ),
    );
  return new Promise((resolve, reject) => {
    let connection: DbConnection | undefined;
    let finished = false;
    const fail = (error?: LeagueSessionError) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      connection?.disconnect();
      reject(
        error ??
          new LeagueSessionError(
            "SpacetimeDB is unavailable. Reconnect and retry.",
            503,
          ),
      );
    };
    const timer = setTimeout(() => fail(), 10000);
    connection = DbConnection.builder()
      .withUri(host)
      .withDatabaseName(database)
      .withToken(token)
      .onConnect((conn, identity) => {
        conn
          .subscriptionBuilder()
          .onError(() => fail())
          .onApplied(() => {
            try {
              const mine = [...conn.db.leaguePlayer.iter()].find(
                (p) => p.owner.isEqual(identity) && p.source === "nessie",
              );
              const states = [...conn.db.myMonthState.iter()].filter((s) =>
                s.playerKey.startsWith("nessie:"),
              );
              // A private baseline alone is not proof of controlling a Nessie customer.
              const playerKey = mine?.playerKey;
              if (!playerKey || !/^nessie:[\w-]{1,100}$/.test(playerKey)) {
                fail(
                  new LeagueSessionError(
                    "Select a live Nessie player and connect to your league first.",
                  ),
                );
                return;
              }
              if (expectedPlayer && expectedPlayer !== playerKey) {
                fail(
                  new LeagueSessionError(
                    "Your selected player changed. Reconnect that player before asking the coach.",
                    409,
                  ),
                );
                return;
              }
              const state = states.find(
                (s) => s.playerKey === playerKey && s.month === month,
              );
              const settings = [...conn.db.myPlayerSettings.iter()].find(
                (s) => s.playerKey === playerKey,
              );
              const controls = () =>
                conn.isActive &&
                [...conn.db.leaguePlayer.iter()].some(
                  (p) => p.playerKey === playerKey && p.owner.isEqual(identity),
                );
              const scores = [...conn.db.scoreSnapshot.iter()].map((s) => ({
                playerKey: s.playerKey,
                month: s.month,
                status: s.status,
                efficiencyPct: s.efficiencyPct ?? null,
                earnedPoints: s.earnedPoints,
                availablePoints: s.availablePoints,
                categories: s.categories.map((c) => ({
                  category: c.category,
                  earned: c.earned,
                  available: c.available,
                  eligible: c.eligible,
                })),
                updatedAt: String(s.updatedAt.microsSinceUnixEpoch),
              }));
              const session: LeagueSession = {
                identity: identity.toHexString(),
                playerKey,
                displayName: mine?.displayName ?? "Your team",
                baseline: state ? JSON.parse(state.baselineJson) : undefined,
                confirmations: settings
                  ? JSON.parse(settings.confirmationsJson)
                  : {},
                overrides: [...conn.db.myCategoryOverride.iter()]
                  .filter((o) => o.playerKey === playerKey)
                  .map((o) => ({
                    transactionId: o.transactionId,
                    category: o.category as CategoryOverride["category"],
                    correctedAt: new Date(
                      Number(o.correctedAt.microsSinceUnixEpoch / 1000n),
                    ).toISOString(),
                  })),
                players: [...conn.db.leaguePlayer.iter()].map((p) => ({
                  playerKey: p.playerKey,
                  displayName: p.displayName,
                  source: p.source,
                })),
                scores,
                controls,
                connection: conn,
                close: () => conn.disconnect(),
              };
              finished = true;
              clearTimeout(timer);
              resolve(session);
            } catch {
              fail(
                new LeagueSessionError(
                  "Your saved financial state could not be read. Refresh and retry.",
                  409,
                ),
              );
            }
          })
          .subscribe([
            tables.leaguePlayer,
            tables.myMonthState,
            tables.myPlayerSettings,
            tables.myCategoryOverride,
            tables.scoreSnapshot,
          ]);
      })
      .onConnectError(() => fail())
      .build();
  });
}

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { SpacetimeDBProvider, useSpacetimeDB, useTable } from "spacetimedb/react";
import type { Timestamp } from "spacetimedb";
import { DbConnection, tables } from "../module_bindings";

/**
 * SpacetimeDB connection. Nessie remains the bank-data source; SpacetimeDB
 * keeps player state (locked baselines, personal budgets, corrections) and the
 * shared live league. When the server is unreachable the app keeps working
 * from localStorage and says so in the top bar.
 */
const env = import.meta.env;
// Shared league on maincloud by default; set VITE_SPACETIMEDB_HOST=ws://localhost:3000 for a local server.
export const STDB_URI: string =
  env.VITE_SPACETIMEDB_HOST || "wss://maincloud.spacetimedb.com";
export const STDB_DB: string =
  env.VITE_SPACETIMEDB_DB || env.VITE_SPACETIMEDB_DB_NAME || "fantasyfinance";
const STDB_ENABLED = env.VITE_SPACETIMEDB_DISABLED !== "true" && env.MODE !== "test";
const TOKEN_KEY = `${STDB_URI}/${STDB_DB}/auth_token`;
/** How long to wait for a connection before falling back to browser storage. */
const CONNECT_GRACE_MS = 4000;

const readToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
};
const writeToken = (token: string) => {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage unavailable — a new identity is issued next visit */
  }
};

export const timestampToIso = (ts: Timestamp) =>
  new Date(Number(ts.microsSinceUnixEpoch / 1000n)).toISOString();

export type CloudStatus = "disabled" | "connecting" | "ready" | "offline";

function useCloudState() {
  const conn = useSpacetimeDB();
  const [monthStates, monthReady] = useTable(tables.myMonthState);
  const [overrides, overridesReady] = useTable(tables.myCategoryOverride);
  const [settings, settingsReady] = useTable(tables.myPlayerSettings);
  const [leaguePlayers] = useTable(tables.leaguePlayer);
  const [scores] = useTable(tables.scoreSnapshot);
  const [online] = useTable(tables.onlinePresence);

  // Give the first connection a moment before declaring the server offline.
  const [graceOver, setGraceOver] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setGraceOver(true), CONNECT_GRACE_MS);
    return () => clearTimeout(id);
  }, []);

  const ready = conn.isActive && monthReady && overridesReady && settingsReady;
  const status: CloudStatus = ready
    ? "ready"
    : conn.connectionError || graceOver
      ? "offline"
      : "connecting";
  const db = conn.getConnection() as DbConnection | null;

  return {
    status: status as CloudStatus,
    identityHex: conn.identity?.toHexString(),
    monthStates,
    overrides,
    settings,
    leaguePlayers,
    scores,
    online,
    reducers: ready && db ? db.reducers : null,
  };
}

export type Cloud = ReturnType<typeof useCloudState>;

const DISABLED: Cloud = {
  status: "disabled",
  identityHex: undefined,
  monthStates: [],
  overrides: [],
  settings: [],
  leaguePlayers: [],
  scores: [],
  online: [],
  reducers: null,
};

const CloudContext = createContext<Cloud>(DISABLED);
export const useCloud = () => useContext(CloudContext);

function CloudBridge({ children }: { children: ReactNode }) {
  const cloud = useCloudState();
  return <CloudContext.Provider value={cloud}>{children}</CloudContext.Provider>;
}

export function SpacetimeRoot({ children }: { children: ReactNode }) {
  const builder = useMemo(
    () =>
      DbConnection.builder()
        .withUri(STDB_URI)
        .withDatabaseName(STDB_DB)
        .withToken(readToken())
        .withAutomaticReconnect()
        .onConnect((_conn, _identity, token) => writeToken(token)),
    [],
  );
  if (!STDB_ENABLED) return <>{children}</>;
  return (
    <SpacetimeDBProvider connectionBuilder={builder}>
      <CloudBridge>{children}</CloudBridge>
    </SpacetimeDBProvider>
  );
}

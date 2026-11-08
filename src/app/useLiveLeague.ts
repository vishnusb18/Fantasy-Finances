import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { nessieToProviderData } from "../lib/finance/adapters/nessie/toProviderData";
import type { ProviderData } from "../lib/finance/types";
import type { LeagueMember } from "../lib/league/data";
import { fetchLeague, LEAGUE_STALE_MS } from "./leagueApi";
import { useCloud } from "./spacetime";

export type LiveLeague = {
  /** League member key (maya, jordan, …) → Nessie customer id. */
  members: LeagueMember[];
  data: Record<string, ProviderData>;
  ready: boolean;
  /** The first league response has arrived (so an empty member list is real). */
  loaded: boolean;
  /** A background refresh is running (the league is shown from cached data). */
  refreshing: boolean;
  error: string | null;
};

/**
 * The live league: every league member that exists as a Nessie customer.
 *
 * All members load in one request from the dev server, which caches them, so
 * the league can render immediately from cache. Members whose cached data is
 * stale are refreshed in the background, and a member is re-fetched only when
 * they publish a newer score to SpacetimeDB than the one our data reflects
 * (i.e. after they make a move).
 */
export function useLiveLeague(enabled: boolean): LiveLeague {
  const cloud = useCloud();
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [data, setData] = useState<Record<string, ProviderData>>({});
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Latest published-score time per customer id: changes when they make a move.
  const cloudReady = cloud.status === "ready";
  const versions = useMemo(() => {
    const v: Record<string, bigint> = {};
    for (const s of cloud.scores) {
      if (!s.playerKey.startsWith("nessie:")) continue;
      const id = s.playerKey.slice("nessie:".length);
      const t = s.updatedAt.microsSinceUnixEpoch;
      if (!(id in v) || t > v[id]) v[id] = t;
    }
    return v;
  }, [cloud.scores]);
  const live = useRef({ versions, cloudReady });
  live.current = { versions, cloudReady };

  /** Score version each member's data reflects (undefined = not known yet). */
  const seen = useRef<Record<string, bigint | undefined>>({});
  const pending = useRef(new Set<string>());

  const load = useCallback(
    async (ids: string[] | undefined, maxAgeMs: number | undefined) => {
      const { versions: atStart, cloudReady: readyAtStart } = live.current;
      ids?.forEach((id) => pending.current.add(id));
      setRefreshing(pending.current.size > 0 || !!ids);
      try {
        const res = await fetchLeague({ ids, maxAgeMs });
        setMembers(res.members);
        setLoaded(true);
        const keyOf = new Map(res.members.map((m) => [m.customerId, m.key]));
        setData((d) => {
          const next = { ...d };
          for (const [id, bundle] of Object.entries(res.bundles)) {
            const key = keyOf.get(id);
            if (key) next[key] = nessieToProviderData(bundle, "nessie");
          }
          return next;
        });
        for (const id of Object.keys(res.bundles))
          seen.current[id] = readyAtStart ? (atStart[id] ?? 0n) : undefined;
        setError(null);
        return res;
      } catch (e) {
        setError(`Couldn't load league data: ${e instanceof Error ? e.message : e}`);
        return undefined;
      } finally {
        ids?.forEach((id) => pending.current.delete(id));
        setRefreshing(pending.current.size > 0);
      }
    },
    [],
  );

  // First load: whatever the server has cached (instant on a warm cache), then
  // refresh anything older than LEAGUE_STALE_MS in the background.
  const started = useRef(false);
  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;
    void load(undefined, undefined).then((res) => {
      const stale = Object.entries(res?.ageMs ?? {})
        .filter(([, age]) => age > LEAGUE_STALE_MS)
        .map(([id]) => id);
      if (stale.length) void load(stale, LEAGUE_STALE_MS);
    });
  }, [enabled, load]);

  // Live updates: re-fetch members whose published score is newer than our data.
  const signature = useMemo(
    () => JSON.stringify(Object.entries(versions).map(([k, v]) => [k, String(v)])),
    [versions],
  );
  useEffect(() => {
    if (!enabled || !cloudReady) return;
    const changed: string[] = [];
    for (const { customerId: id } of members) {
      if (pending.current.has(id) || !(id in seen.current)) continue;
      const current = versions[id] ?? 0n;
      const had = seen.current[id];
      if (had === undefined) seen.current[id] = current; // data loaded before scores arrived
      else if (current > had) changed.push(id);
    }
    if (changed.length) void load(changed, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, cloudReady, signature, members, data]);

  return {
    members,
    data,
    ready: members.length >= 2 && members.every((m) => data[m.key]),
    loaded,
    refreshing,
    error,
  };
}

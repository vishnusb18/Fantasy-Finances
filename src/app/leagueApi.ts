import type { LeagueDataResponse } from "../lib/league/data";

/**
 * Load league data from the dev server in one request (see server/leagueData.ts).
 * `maxAgeMs`: accept a cached copy up to this old (default: any age; 0 = fresh).
 */
export async function fetchLeague(
  opts: { ids?: string[]; maxAgeMs?: number } = {},
): Promise<LeagueDataResponse> {
  const q = new URLSearchParams();
  if (opts.ids?.length) q.set("ids", opts.ids.join(","));
  if (opts.maxAgeMs !== undefined) q.set("maxAge", String(opts.maxAgeMs));
  const res = await fetch(`/api/league${q.size ? `?${q}` : ""}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `League data request failed (${res.status})`);
  return body as LeagueDataResponse;
}

/** Cached data older than this is refreshed in the background. */
export const LEAGUE_STALE_MS = 30_000;

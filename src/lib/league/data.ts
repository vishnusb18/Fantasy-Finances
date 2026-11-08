import type { NessieBundle } from "../finance/adapters/nessie/types";

/** A league member (maya, jordan, …) and the Nessie customer that plays it. */
export type LeagueMember = { key: string; customerId: string };

/** Response of the dev server's GET /api/league. */
export type LeagueDataResponse = {
  members: LeagueMember[];
  /** Raw Nessie data per requested customer id. */
  bundles: Record<string, NessieBundle>;
  /** How old each bundle is (server clock), so the client can refresh stale ones. */
  ageMs: Record<string, number>;
};

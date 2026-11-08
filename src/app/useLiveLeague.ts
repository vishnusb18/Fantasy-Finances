import { useEffect, useMemo, useRef, useState } from "react";
import { MEMBERS } from "../lib/competition/demo";
import type { NessieCustomer } from "../lib/finance/adapters/nessie/types";
import { nessieToProviderData } from "../lib/finance/adapters/nessie/toProviderData";
import type { ProviderData } from "../lib/finance/types";
import { useCloud } from "./spacetime";
import { nessie } from "./useFinance";

export type LiveLeague = {
  /** League member key (maya, jordan, …) → Nessie customer id. */
  members: Array<{ key: string; customerId: string }>;
  data: Record<string, ProviderData>;
  ready: boolean;
  error: string | null;
};

/**
 * The live league: every league member that exists as a Nessie customer.
 * Each member's Nessie data is loaded once, then re-fetched whenever that
 * player publishes a new score to SpacetimeDB (i.e. after they make a move).
 */
export function useLiveLeague(
  enabled: boolean,
  customers: NessieCustomer[] | null,
): LiveLeague {
  const cloud = useCloud();
  const [data, setData] = useState<Record<string, ProviderData>>({});
  const [error, setError] = useState<string | null>(null);
  const fetched = useRef<Record<string, string>>({});

  const members = useMemo(
    () =>
      MEMBERS.flatMap((m) => {
        const c = customers?.find(
          (c) => c.first_name === m.firstName && c.last_name === m.lastName,
        );
        return c ? [{ key: m.key, customerId: c._id }] : [];
      }),
    [customers],
  );

  // Latest published-score time per member: changes when they make a move.
  const versions = useMemo(() => {
    const v: Record<string, string> = {};
    for (const m of members) {
      const key = `nessie:${m.customerId}`;
      const latest = cloud.scores
        .filter((s) => s.playerKey === key)
        .map((s) => s.updatedAt.microsSinceUnixEpoch)
        .reduce((a, b) => (b > a ? b : a), 0n);
      v[m.key] = String(latest);
    }
    return v;
  }, [members, cloud.scores]);
  const signature = JSON.stringify(versions);

  useEffect(() => {
    if (!enabled) return;
    for (const m of members) {
      const version = versions[m.key];
      if (fetched.current[m.key] === version) continue;
      fetched.current[m.key] = version;
      nessie
        .fetchBundle(m.customerId)
        .then((bundle) =>
          setData((d) => ({ ...d, [m.key]: nessieToProviderData(bundle, "nessie") })),
        )
        .catch((e) => {
          delete fetched.current[m.key]; // retry on the next change
          setError(
            `Couldn't load league data: ${e instanceof Error ? e.message : e}`,
          );
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, members, signature]);

  return {
    members,
    data,
    ready: members.length >= 2 && members.every((m) => data[m.key]),
    error,
  };
}

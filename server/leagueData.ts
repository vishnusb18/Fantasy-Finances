import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";
import { createNessieClient, type NessieClient } from "../src/lib/finance/adapters/nessie/client";
import type {
  NessieBundle,
  NessieCustomer,
  NessieMerchant,
} from "../src/lib/finance/adapters/nessie/types";
import { MEMBERS } from "../src/lib/competition/demo";
import type { LeagueDataResponse, LeagueMember } from "../src/lib/league/data";

/**
 * League data for the browser in one request.
 *
 * Loading the league straight from the browser took ~250 small Nessie calls
 * (about 32 per member, ~6 at a time) — around 8 s. Here the dev server fetches
 * in parallel from Node, looks merchants up once instead of per purchase,
 * de-duplicates concurrent requests and caches the result in memory and on
 * disk, so a reload (or a dev-server restart) can render immediately while
 * stale members refresh in the background.
 */

type Entry = { bundle: NessieBundle; fetchedAt: number };
type Snapshot = {
  customers?: { list: NessieCustomer[]; at: number };
  merchants?: { list: NessieMerchant[]; at: number };
  bundles: Record<string, Entry>;
};
export type LeagueCacheStore = { load: () => Snapshot | undefined; save: (s: Snapshot) => void };

/** Customer and merchant lists rarely change; refresh them every 10 minutes. */
const LIST_TTL_MS = 10 * 60_000;
const ID = /^[\w-]{1,100}$/;

export class LeagueDataError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function createLeagueDataService(deps: {
  nessie: NessieClient;
  now?: () => number;
  store?: LeagueCacheStore;
}) {
  const now = deps.now ?? Date.now;
  const saved = deps.store?.load();
  let customers = saved?.customers;
  let merchants = saved?.merchants;
  const bundles = new Map<string, Entry>(Object.entries(saved?.bundles ?? {}));
  const inflight = new Map<string, Promise<Entry>>();
  let listInflight: Promise<void> | undefined;

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  const persist = () => {
    if (!deps.store || saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = undefined;
      deps.store!.save({ customers, merchants, bundles: Object.fromEntries(bundles) });
    }, 500);
  };

  async function refreshLists(force = false) {
    const fresh = (x?: { at: number }) => !!x && now() - x.at < LIST_TTL_MS;
    if (!force && fresh(customers) && fresh(merchants)) return;
    listInflight ??= (async () => {
      const [c, m] = await Promise.all([
        deps.nessie.listCustomers(),
        deps.nessie.get<NessieMerchant[]>("/merchants"),
      ]);
      customers = { list: c, at: now() };
      merchants = { list: Array.isArray(m) ? m : [], at: now() };
      persist();
    })().finally(() => (listInflight = undefined));
    await listInflight;
  }

  function members(): LeagueMember[] {
    return MEMBERS.flatMap((m) => {
      const c = customers?.list.find(
        (c) => c.first_name === m.firstName && c.last_name === m.lastName,
      );
      return c ? [{ key: m.key, customerId: c._id }] : [];
    });
  }

  /** Fetch one customer's bundle (one request at a time per customer). */
  function refresh(customerId: string): Promise<Entry> {
    let p = inflight.get(customerId);
    if (!p) {
      p = deps.nessie
        .fetchBundle(customerId, { merchants: merchants?.list })
        .then((bundle) => {
          const entry = { bundle, fetchedAt: now() };
          bundles.set(customerId, entry);
          persist();
          return entry;
        })
        .finally(() => inflight.delete(customerId));
      inflight.set(customerId, p);
    }
    return p;
  }

  /**
   * League members plus bundles for `ids` (default: every member). A cached
   * bundle is returned if it's younger than `maxAgeMs` (default: any age).
   */
  async function get(opts: { ids?: string[]; maxAgeMs?: number } = {}): Promise<LeagueDataResponse> {
    const maxAge = opts.maxAgeMs ?? Infinity;
    await refreshLists();
    let wanted = opts.ids ?? members().map((m) => m.customerId);
    if (wanted.some((id) => !ID.test(id))) throw new LeagueDataError("Invalid customer id.");
    // Only serve customers that belong to this Nessie key.
    const known = () => new Set(customers?.list.map((c) => c._id));
    if (wanted.some((id) => !known().has(id))) await refreshLists(true);
    wanted = wanted.filter((id) => known().has(id));

    const entries = await Promise.all(
      wanted.map(async (id) => {
        const cached = bundles.get(id);
        const entry = cached && now() - cached.fetchedAt <= maxAge ? cached : await refresh(id);
        return [id, entry] as const;
      }),
    );
    return {
      members: members(),
      bundles: Object.fromEntries(entries.map(([id, e]) => [id, e.bundle])),
      ageMs: Object.fromEntries(entries.map(([id, e]) => [id, Math.max(0, now() - e.fetchedAt)])),
    };
  }

  return { get };
}

/** Disk cache in .cache/ (gitignored) so a dev-server restart starts warm. */
function diskStore(root: string): LeagueCacheStore {
  const dir = join(root, ".cache");
  const file = join(dir, "league-data.json");
  return {
    load: () => {
      try {
        return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Snapshot) : undefined;
      } catch {
        return undefined; // a corrupt cache is just a cold start
      }
    },
    save: (s) => {
      try {
        mkdirSync(dir, { recursive: true });
        writeFileSync(`${file}.tmp`, JSON.stringify(s));
        renameSync(`${file}.tmp`, file);
      } catch {
        /* caching is best-effort */
      }
    },
  };
}

export function leagueDataPlugin(env: Record<string, string>): Plugin {
  return {
    name: "fantasy-finance-league-data",
    configureServer(server) {
      let service: ReturnType<typeof createLeagueDataService> | undefined;
      server.middlewares.use("/api/league", (req, res) => {
        const respond = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(body));
        };
        if (req.method !== "GET") return respond(405, { error: "Use GET." });
        if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)
          return respond(403, { error: "Same-origin requests only." });
        if (!env.NESSIE_API_KEY) return respond(503, { error: "NESSIE_API_KEY is not set on the dev server." });
        service ??= createLeagueDataService({
          nessie: createNessieClient({
            baseUrl: env.NESSIE_BASE_URL || "https://api.nessieisreal.com",
            apiKey: env.NESSIE_API_KEY,
          }),
          store: diskStore(server.config.root),
        });
        const q = new URL(req.url ?? "/", "http://local").searchParams;
        const ids = q.get("ids")?.split(",").filter(Boolean);
        const maxAge = q.has("maxAge") ? Number(q.get("maxAge")) : undefined;
        service
          .get({ ids, maxAgeMs: Number.isFinite(maxAge) ? maxAge : undefined })
          .then((body) => respond(200, body))
          .catch((e) =>
            respond(e instanceof LeagueDataError ? e.status : 502, {
              error: e instanceof Error ? e.message : "Couldn't load league data from Nessie.",
            }),
          );
      });
    },
  };
}

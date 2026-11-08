import { describe, expect, it } from "vitest";
import { createLeagueDataService, LeagueDataError } from "../server/leagueData";
import type { NessieClient } from "../src/lib/finance/adapters/nessie/client";
import type { NessieBundle, NessieMerchant } from "../src/lib/finance/adapters/nessie/types";

const CUSTOMERS = [
  { _id: "c-maya", first_name: "Maya", last_name: "Chen" },
  { _id: "c-jordan", first_name: "Jordan", last_name: "Reyes" },
  { _id: "c-other", first_name: "Not", last_name: "AMember" },
];

function fakeNessie() {
  const calls = { customers: 0, merchants: 0, bundles: [] as string[], merchantOpts: [] as unknown[] };
  let resolveBundle: (() => void) | undefined;
  const client = {
    listCustomers: async () => {
      calls.customers++;
      return CUSTOMERS;
    },
    get: async (path: string) => {
      if (path === "/merchants") calls.merchants++;
      return [{ _id: "m1", name: "Chipotle", category: ["food"] }] as NessieMerchant[];
    },
    fetchBundle: async (id: string, opts?: { merchants?: NessieMerchant[] }) => {
      calls.bundles.push(id);
      calls.merchantOpts.push(opts?.merchants);
      if (holdBundles) await new Promise<void>((r) => (resolveBundle = r));
      return { customer: { _id: id } } as unknown as NessieBundle;
    },
  } as unknown as NessieClient;
  let holdBundles = false;
  return {
    client,
    calls,
    hold: () => (holdBundles = true),
    release: () => {
      holdBundles = false;
      resolveBundle?.();
    },
  };
}

describe("league data service", () => {
  it("returns league members and their bundles, looking merchants up once", async () => {
    const n = fakeNessie();
    const svc = createLeagueDataService({ nessie: n.client });
    const res = await svc.get();
    expect(res.members).toEqual([
      { key: "maya", customerId: "c-maya" },
      { key: "jordan", customerId: "c-jordan" },
    ]);
    expect(Object.keys(res.bundles).sort()).toEqual(["c-jordan", "c-maya"]);
    expect(n.calls.merchants).toBe(1);
    expect(n.calls.merchantOpts.every((m) => Array.isArray(m) && m.length === 1)).toBe(true);
  });

  it("serves cached bundles, and refetches only when older than maxAge", async () => {
    let t = 1_000_000;
    const n = fakeNessie();
    const svc = createLeagueDataService({ nessie: n.client, now: () => t });
    await svc.get();
    expect(n.calls.bundles).toHaveLength(2);

    t += 20_000;
    const cached = await svc.get();
    expect(n.calls.bundles).toHaveLength(2); // no new Nessie calls
    expect(cached.ageMs["c-maya"]).toBe(20_000);

    await svc.get({ ids: ["c-maya"], maxAgeMs: 30_000 });
    expect(n.calls.bundles).toHaveLength(2); // still fresh enough

    await svc.get({ ids: ["c-maya"], maxAgeMs: 0 });
    expect(n.calls.bundles).toEqual(["c-maya", "c-jordan", "c-maya"]);
  });

  it("shares one Nessie fetch between concurrent requests for the same customer", async () => {
    const n = fakeNessie();
    const svc = createLeagueDataService({ nessie: n.client });
    await svc.get({ ids: [] }); // warm the customer/merchant lists
    n.hold();
    const a = svc.get({ ids: ["c-maya"], maxAgeMs: 0 });
    const b = svc.get({ ids: ["c-maya"], maxAgeMs: 0 });
    await new Promise((r) => setTimeout(r, 0));
    n.release();
    await Promise.all([a, b]);
    expect(n.calls.bundles.filter((id) => id === "c-maya")).toHaveLength(1);
  });

  it("serves a non-member customer by id, but never ids outside this Nessie key", async () => {
    const n = fakeNessie();
    const svc = createLeagueDataService({ nessie: n.client });
    const res = await svc.get({ ids: ["c-other", "c-unknown"] });
    expect(Object.keys(res.bundles)).toEqual(["c-other"]);
    await expect(svc.get({ ids: ["../etc"] })).rejects.toBeInstanceOf(LeagueDataError);
  });

  it("starts warm from the saved cache without calling Nessie", async () => {
    const n = fakeNessie();
    const t = 5_000_000;
    const svc = createLeagueDataService({
      nessie: n.client,
      now: () => t,
      store: {
        load: () => ({
          customers: { list: CUSTOMERS, at: t - 1000 },
          merchants: { list: [], at: t - 1000 },
          bundles: {
            "c-maya": { bundle: { customer: { _id: "c-maya" } } as unknown as NessieBundle, fetchedAt: t - 60_000 },
            "c-jordan": { bundle: { customer: { _id: "c-jordan" } } as unknown as NessieBundle, fetchedAt: t - 60_000 },
          },
        }),
        save: () => {},
      },
    });
    const res = await svc.get();
    expect(Object.keys(res.bundles).sort()).toEqual(["c-jordan", "c-maya"]);
    expect(res.ageMs["c-maya"]).toBe(60_000); // the client refreshes this in the background
    expect(n.calls).toMatchObject({ customers: 0, merchants: 0, bundles: [] });
  });
});

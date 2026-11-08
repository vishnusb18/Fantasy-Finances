import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { timestampToIso, useCloud, type Cloud } from "./spacetime";
import { publicScoreArgs } from "../lib/league/publish";
import { fetchLeague, LEAGUE_STALE_MS } from "./leagueApi";
import { createNessieClient } from "../lib/finance/adapters/nessie/client";
import type { NessieCustomer } from "../lib/finance/adapters/nessie/types";
import { nessieToProviderData } from "../lib/finance/adapters/nessie/toProviderData";
import {
  createPersonalBudget,
  generateBudgetBaseline,
  updatePersonalBudget,
  type PersonalBudgetPatch,
} from "../lib/finance/baseline";
import { generatePersonaBundle } from "../lib/finance/demo/personas";
import { MEMBERS as PERSONAS } from "../lib/competition/demo";
import { runFinancePipeline } from "../lib/finance/pipeline";
import { DEFAULT_POLICY } from "../lib/finance/policy";
import type {
  CategoryOverride,
  PersonalBudget,
  PlayerConfirmations,
  ProviderData,
  ScoringBaseline,
  TransactionCategory,
} from "../lib/finance/types";
import { isoDate, monthOf } from "../lib/finance/util";

// Player state (corrections, confirmations, the locked baseline, personal
// goals) is stored in SpacetimeDB when connected. localStorage is a cache and
// the fallback when the server is unreachable; every access is guarded so the
// app still works without it.
const store = {
  get<T>(key: string): T | undefined {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : undefined;
    } catch {
      return undefined;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable — keep working in memory */
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

export type SourceChoice =
  { kind: "nessie"; customerId: string } | { kind: "sample"; persona: string };

const localToday = () => {
  const d = new Date();
  return isoDate(new Date(d.getTime() - d.getTimezoneOffset() * 60_000));
};

export const nessie = createNessieClient({ baseUrl: "/nessie" });

/**
 * The selected customer's Nessie data, through the dev server's cached league
 * endpoint — the same copy the league uses, so it's fetched once, not twice.
 */
async function loadOwnBundle(customerId: string, maxAgeMs: number) {
  const res = await fetchLeague({ ids: [customerId], maxAgeMs });
  const bundle = res.bundles[customerId];
  if (!bundle) throw new Error("Customer not found in Nessie.");
  return bundle;
}

export function useFinance() {
  const asOf = useMemo(localToday, []);
  const month = monthOf(asOf);

  const [source, setSource] = useState<SourceChoice>(
    () =>
      store.get<SourceChoice>("ff:source") ??
      (__NESSIE_CONFIGURED__
        ? { kind: "nessie", customerId: "" }
        : { kind: "sample", persona: PERSONAS[0].key }),
  );
  const [customers, setCustomers] = useState<NessieCustomer[] | null>(null);
  const [data, setData] = useState<ProviderData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => store.set("ff:source", source), [source]);

  // Nessie customer list.
  useEffect(() => {
    if (source.kind !== "nessie" || !__NESSIE_CONFIGURED__ || customers) return;
    nessie
      .listCustomers()
      .then((list) => {
        setCustomers(list);
        if (!source.customerId && list[0])
          setSource({ kind: "nessie", customerId: list[0]._id });
      })
      .catch((e) =>
        setError(
          `Couldn't reach Nessie: ${e instanceof Error ? e.message : e}`,
        ),
      );
  }, [source, customers]);

  // Load the selected player's data.
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setLoading(false);
    setData(null);
    if (source.kind === "sample") {
      const spec =
        PERSONAS.find((p) => p.key === source.persona) ?? PERSONAS[0];
      setData(nessieToProviderData(generatePersonaBundle(spec, asOf), "seed"));
      return;
    }
    if (!__NESSIE_CONFIGURED__ || !source.customerId) {
      setData(null);
      return;
    }
    setLoading(true);
    loadOwnBundle(source.customerId, LEAGUE_STALE_MS)
      .then(
        (bundle) =>
          !cancelled && setData(nessieToProviderData(bundle, "nessie")),
      )
      .catch(
        (e) =>
          !cancelled &&
          setError(
            `Couldn't load Nessie data: ${e instanceof Error ? e.message : e}`,
          ),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [source, asOf]);

  const playerId = data?.playerId ?? "";
  const k = (name: string) => `ff:${name}:${playerId}:${month}`;

  const [overrides, setOverrides] = useState<CategoryOverride[]>([]);
  const [confirmations, setConfirmations] = useState<PlayerConfirmations>({});
  const [locked, setLocked] = useState<ScoringBaseline | undefined>();
  const [personal, setPersonal] = useState<PersonalBudget | undefined>();
  // Which player's saved state is currently loaded. The lock / personal-budget
  // effects wait for this so they never overwrite saved state mid-restore.
  const [restoredKey, setRestoredKey] = useState("");

  // Where player state lives right now. "wait" holds the restore briefly while
  // the first SpacetimeDB connection is being made.
  const cloud = useCloud();
  const selectedSource = useRef(source);
  selectedSource.current = source;
  const refreshNessie = useCallback(async () => {
    if (source.kind !== "nessie" || !source.customerId) return;
    const next = nessieToProviderData(
      await loadOwnBundle(source.customerId, 0),
      "nessie",
    );
    const current = selectedSource.current;
    if (current.kind === "nessie" && current.customerId === source.customerId)
      setData(next);
  }, [source]);
  const ownVersion = cloud.scores
    .filter((s) => s.playerKey === playerId && s.month === month)
    .reduce(
      (latest, s) =>
        s.updatedAt.microsSinceUnixEpoch > latest
          ? s.updatedAt.microsSinceUnixEpoch
          : latest,
      0n,
    )
    .toString();
  const lastOwnVersion = useRef("");
  useEffect(() => {
    if (source.kind !== "nessie" || !playerId || ownVersion === "0") return;
    const version = `${playerId}:${ownVersion}`;
    if (lastOwnVersion.current === version) return;
    // The first score we see for this player is already reflected in the data
    // we just loaded; only a newer one (a move) needs a re-fetch.
    const firstSighting = !lastOwnVersion.current.startsWith(`${playerId}:`);
    lastOwnVersion.current = version;
    if (firstSighting) return;
    void refreshNessie().catch(() =>
      setError("Couldn't refresh the latest Nessie activity."),
    );
  }, [source.kind, playerId, ownVersion, refreshNessie]);
  const storeMode =
    cloud.status === "ready"
      ? "cloud"
      : cloud.status === "connecting"
        ? "wait"
        : "local";
  const restoreKey = `${playerId}:${month}:${storeMode}`;
  const restored =
    !!playerId && storeMode !== "wait" && restoredKey === restoreKey;

  // Reducer calls run one at a time, in order (lock before personal budget
  // before score), and a failure is surfaced instead of thrown.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [cloudError, setCloudError] = useState<string | null>(null);
  const send = useCallback(
    (
      label: string,
      call: (r: NonNullable<Cloud["reducers"]>) => Promise<void>,
    ) => {
      const reducers = cloud.reducers;
      if (!reducers) return;
      queue.current = queue.current
        .then(() => call(reducers))
        .then(
          () => setCloudError(null),
          (e) => {
            const msg = e instanceof Error ? e.message : String(e);
            console.warn(`SpacetimeDB ${label} failed:`, e);
            setCloudError(`${label}: ${msg}`);
          },
        );
    },
    [cloud.reducers],
  );
  const lockRemote = (b: ScoringBaseline, revisionReason?: string) =>
    send("Lock baseline", (r) =>
      r.lockBaseline({
        playerKey: b.playerId,
        month: b.month,
        baselineId: b.id,
        baselineJson: JSON.stringify(b),
        revisionReason,
      }),
    );
  const savePersonalRemote = (pb: PersonalBudget) =>
    send("Save personal budget", (r) =>
      r.savePersonalBudget({
        playerKey: pb.playerId,
        month: pb.month,
        personalBudgetJson: JSON.stringify(pb),
      }),
    );
  const overrideRemote = (o: CategoryOverride) =>
    send("Save correction", (r) =>
      r.setCategoryOverride({
        playerKey: playerId,
        transactionId: o.transactionId,
        category: o.category,
      }),
    );
  const confirmRemote = (c: PlayerConfirmations) =>
    send("Save confirmations", (r) =>
      r.saveConfirmations({
        playerKey: playerId,
        confirmationsJson: JSON.stringify(c),
      }),
    );

  // Per-player state, restored when the player, month or store changes.
  useEffect(() => {
    if (!playerId || storeMode === "wait") return;
    const local = {
      overrides:
        store.get<CategoryOverride[]>(`ff:overrides:${playerId}`) ?? [],
      confirmations: store.get<PlayerConfirmations>(`ff:confirm:${playerId}`),
      baseline: store.get<ScoringBaseline>(k("baseline")),
      personal: store.get<PersonalBudget>(k("personal")),
    };
    if (storeMode === "local") {
      setOverrides(local.overrides);
      setConfirmations(local.confirmations ?? {});
      setLocked(local.baseline);
      setPersonal(local.personal);
      setRestoredKey(restoreKey);
      return;
    }

    // Cloud is the source of truth. Anything saved only in this browser (e.g.
    // while offline) is uploaded so it isn't lost.
    const parse = <T>(json?: string) => {
      if (!json) return undefined;
      try {
        return JSON.parse(json) as T;
      } catch {
        return undefined;
      }
    };
    const ms = cloud.monthStates.find(
      (r) => r.playerKey === playerId && r.month === month,
    );
    const settings = cloud.settings.find((r) => r.playerKey === playerId);

    let baseline = parse<ScoringBaseline>(ms?.baselineJson);
    if (!baseline && local.baseline) {
      baseline = local.baseline;
      lockRemote(local.baseline);
    }
    let personal = parse<PersonalBudget>(ms?.personalBudgetJson ?? undefined);
    if (
      !personal &&
      local.personal &&
      local.personal.baselineId === baseline?.id
    ) {
      personal = local.personal;
      savePersonalRemote(local.personal);
    }

    const cloudOverrides: CategoryOverride[] = cloud.overrides
      .filter((r) => r.playerKey === playerId)
      .map((r) => ({
        transactionId: r.transactionId,
        category: r.category as TransactionCategory,
        correctedAt: timestampToIso(r.correctedAt),
      }));
    const localOnly = local.overrides.filter(
      (o) => !cloudOverrides.some((c) => c.transactionId === o.transactionId),
    );
    localOnly.forEach(overrideRemote);
    const mergedOverrides = [...cloudOverrides, ...localOnly];

    let confirms = parse<PlayerConfirmations>(settings?.confirmationsJson);
    if (!confirms && local.confirmations) {
      confirms = local.confirmations;
      confirmRemote(local.confirmations);
    }

    setOverrides(mergedOverrides);
    setConfirmations(confirms ?? {});
    setLocked(baseline);
    setPersonal(personal);
    // Keep the browser cache in step for offline use.
    store.set(`ff:overrides:${playerId}`, mergedOverrides);
    if (confirms) store.set(`ff:confirm:${playerId}`, confirms);
    if (baseline) store.set(k("baseline"), baseline);
    if (personal) store.set(k("personal"), personal);
    setRestoredKey(restoreKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, month, storeMode]);

  const result = useMemo(
    () =>
      data && restored
        ? runFinancePipeline({
            data,
            asOf,
            overrides,
            confirmations,
            lockedBaseline: locked,
          })
        : null,
    [data, restored, asOf, overrides, confirmations, locked],
  );

  // Lock the first usable baseline of the month; start a personal budget from it.
  useEffect(() => {
    if (!result || !restored || locked || result.baseline.status !== "locked")
      return;
    setLocked(result.baseline);
    store.set(k("baseline"), result.baseline);
    lockRemote(result.baseline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, restored, locked]);
  useEffect(() => {
    if (!result || !restored || result.baseline.status !== "locked") return;
    if (personal?.baselineId === result.baseline.id) return;
    const pb = createPersonalBudget(result.baseline);
    setPersonal(pb);
    store.set(k("personal"), pb);
    savePersonalRemote(pb);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, restored, personal]);

  // League: register the viewed player and publish its public score summary
  // (category points only — no amounts or transactions leave the browser).
  // Only live Nessie players compete; the offline sample never joins.
  const competing = data?.source === "nessie";
  const lastPublished = useRef("");
  useEffect(() => {
    if (!data || !competing || storeMode !== "cloud") return;
    lastPublished.current = "";
    send("Join league", (r) =>
      r.joinLeague({
        playerKey: data.playerId,
        displayName: data.displayName,
        source: data.source,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.playerId, data?.displayName, competing, storeMode, send]);
  useEffect(() => {
    if (!result || !locked || !restored || !competing || storeMode !== "cloud")
      return;
    const args = publicScoreArgs(result.score);
    const signature = JSON.stringify(args);
    if (signature === lastPublished.current) return;
    lastPublished.current = signature;
    send("Publish score", (r) => r.publishScore(args));
  }, [result, locked, restored, competing, storeMode, send]);

  /** What a fresh baseline would look like with current corrections — for "apply corrections". */
  const proposed = useMemo(
    () =>
      result && locked
        ? generateBudgetBaseline(result.profile, DEFAULT_POLICY, {
            previous: locked,
          })
        : undefined,
    [result, locked],
  );
  const correctionsChangeBaseline =
    !!proposed &&
    !!locked &&
    (proposed.budgetableCapacityCents !== locked.budgetableCapacityCents ||
      proposed.investing.eligible !== locked.investing.eligible);

  const recategorize = useCallback(
    (transactionId: string, category: TransactionCategory) => {
      const o = {
        transactionId,
        category,
        correctedAt: new Date().toISOString(),
      };
      const next = [
        ...overrides.filter((x) => x.transactionId !== transactionId),
        o,
      ];
      setOverrides(next);
      store.set(`ff:overrides:${playerId}`, next);
      overrideRemote(o);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [overrides, playerId, send],
  );

  const updateConfirmations = useCallback(
    (next: PlayerConfirmations) => {
      setConfirmations(next);
      store.set(`ff:confirm:${playerId}`, next);
      confirmRemote(next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playerId, send],
  );

  const applyCorrectionsToBaseline = useCallback(
    (reason: string) => {
      if (!result || !locked) return;
      const next = generateBudgetBaseline(result.profile, DEFAULT_POLICY, {
        previous: locked,
        revisionReason: reason,
      });
      setLocked(next);
      store.set(k("baseline"), next);
      lockRemote(next, reason || "Applied category corrections");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result, locked, send],
  );

  const editPersonal = useCallback(
    (patch: PersonalBudgetPatch) => {
      if (!personal) return;
      const next = updatePersonalBudget(personal, patch);
      setPersonal(next);
      store.set(k("personal"), next);
      savePersonalRemote(next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [personal, send],
  );

  const resetPlayer = useCallback(() => {
    ["baseline", "personal"].forEach((n) => store.remove(k(n)));
    store.remove(`ff:overrides:${playerId}`);
    store.remove(`ff:confirm:${playerId}`);
    setOverrides([]);
    setConfirmations({});
    setLocked(undefined);
    setPersonal(undefined);
    lastPublished.current = "";
    send("Reset player", (r) => r.resetPlayer({ playerKey: playerId }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, month, send]);

  return {
    asOf,
    month,
    source,
    setSource,
    customers,
    data,
    loading,
    error,
    result,
    personal,
    confirmations,
    overrides,
    correctionsChangeBaseline,
    proposed,
    recategorize,
    updateConfirmations,
    applyCorrectionsToBaseline,
    editPersonal,
    resetPlayer,
    refreshNessie,
    cloudStatus: cloud.status,
    cloudError,
  };
}

export type FinanceState = ReturnType<typeof useFinance> & {
  readOnly?: boolean;
};

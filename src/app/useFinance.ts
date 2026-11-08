import { useCallback, useEffect, useMemo, useState } from "react";
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

// Option A: everything lives in this browser tab. localStorage only remembers
// per-player conveniences (corrections, personal goals, the locked baseline)
// and every access is guarded so the app still works without it.
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
    nessie
      .fetchBundle(source.customerId)
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
  const playerKey = `${playerId}:${month}`;
  const restored = !!playerId && restoredKey === playerKey;

  // Per-player state, restored when the player changes.
  useEffect(() => {
    if (!playerId) return;
    setOverrides(store.get(`ff:overrides:${playerId}`) ?? []);
    setConfirmations(store.get(`ff:confirm:${playerId}`) ?? {});
    setLocked(store.get(k("baseline")));
    setPersonal(store.get(k("personal")));
    setRestoredKey(playerKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, month]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, restored, locked]);
  useEffect(() => {
    if (!result || !restored || result.baseline.status !== "locked") return;
    if (personal?.baselineId === result.baseline.id) return;
    const pb = createPersonalBudget(result.baseline);
    setPersonal(pb);
    store.set(k("personal"), pb);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, restored, personal]);

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
      const next = [
        ...overrides.filter((o) => o.transactionId !== transactionId),
        { transactionId, category, correctedAt: new Date().toISOString() },
      ];
      setOverrides(next);
      store.set(`ff:overrides:${playerId}`, next);
    },
    [overrides, playerId],
  );

  const updateConfirmations = useCallback(
    (next: PlayerConfirmations) => {
      setConfirmations(next);
      store.set(`ff:confirm:${playerId}`, next);
    },
    [playerId],
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
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result, locked],
  );

  const editPersonal = useCallback(
    (patch: PersonalBudgetPatch) => {
      if (!personal) return;
      const next = updatePersonalBudget(personal, patch);
      setPersonal(next);
      store.set(k("personal"), next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [personal],
  );

  const resetPlayer = useCallback(() => {
    ["baseline", "personal"].forEach((n) => store.remove(k(n)));
    store.remove(`ff:overrides:${playerId}`);
    store.remove(`ff:confirm:${playerId}`);
    setOverrides([]);
    setConfirmations({});
    setLocked(undefined);
    setPersonal(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, month]);

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
  };
}

export type FinanceState = ReturnType<typeof useFinance> & { readOnly?: boolean };

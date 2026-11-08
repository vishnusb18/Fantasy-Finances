import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { FinanceState } from "./useFinance";
import { readToken, useCloud } from "./spacetime";
import { categoryLabel } from "../lib/finance/scoring";
import {
  DISCRETIONARY_CATEGORIES,
  type DiscretionaryCategory,
} from "../lib/finance/types";
import { formatCents, formatEfficiency } from "../lib/finance/util";
import {
  simulateMove,
  movePurchases,
  moveSnapshot,
  refundableCents,
  type Move,
  type MoveInput,
  type MovePreview,
  type MoveSubmission,
} from "../lib/competition/moves";
import { monthTitle } from "./MonthNavigation";
import { positionLabel } from "./competitionIdentity";

type Opponent = {
  name: string;
  actual: number | null;
  projected: number | null;
};
type Props = {
  f: FinanceState;
  month: string;
  involvesPlayer: boolean;
  opponent: Opponent | null;
};
const actions = [
  {
    kind: "spend",
    title: "Spend",
    subtitle: "Make a purchase.",
    path: "M2 4h3l3 11h11l3-8H6M9 18h2v3H9zm9 0h2v3h-2z",
  },
  {
    kind: "save",
    title: "Save",
    subtitle: "Move to savings.",
    path: "M4 9h3V6h10v3h3v3h2v5h-3v4h-3v-3H9v3H6v-5H3v-6H1V7h3zm7-6h4v2h-4zm5 7h2v2h-2z",
  },
  {
    kind: "invest",
    title: "Invest",
    subtitle: "Contribute funds.",
    path: "M3 3v18h19M6 16l5-5 4 3 6-8m-5 0h5v5",
  },
  {
    kind: "bill",
    title: "Pay a Bill",
    subtitle: "Manage an obligation.",
    path: "M5 2h14v20l-4-2-3 2-3-2-4 2zm3 5h8m-8 5h8m-8 5h5",
  },
  {
    kind: "return",
    title: "Return",
    subtitle: "Refund a purchase.",
    path: "M9 4 3 10l6 6M4 10h11v-1h5v10H10",
  },
] as const;
export function MoveSparkles() {
  return (
    <svg className="move-sparkles" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="m9 1 2 6 6 2-6 2-2 6-2-6-6-2 6-2zm10 12 1.5 4.5L25 19l-4.5 1.5L19 25l-1.5-4.5L13 19l4.5-1.5z"
      />
    </svg>
  );
}
const percent = (n: number | null | undefined) =>
  formatEfficiency(n, "Unavailable");
const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}`;
const leader = (own: number, other: number, name: string) =>
  own === other ? "Tie" : own > other ? "You" : name;
const usePositionEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function MakeAMove({ f, month, involvesPlayer, opponent }: Props) {
  const cloud = useCloud();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= 650,
  );
  const [placement, setPlacement] = useState({
    left: 16,
    top: 120,
    width: 600,
    maxHeight: 600,
    pointer: 30,
    above: false,
  });
  const [kind, setKind] = useState<Move["kind"]>("spend");
  const [amount, setAmount] = useState("25.00");
  const [category, setCategory] = useState<DiscretionaryCategory>("dining_out");
  const [billId, setBillId] = useState("");
  const [purchaseId, setPurchaseId] = useState("");
  const [preview, setPreview] = useState<MovePreview | null>(null);
  const [previewDraft, setPreviewDraft] = useState("");
  const [operationId, setOperationId] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const pendingKey = `ff:move-pending:${f.data?.playerId}:${f.month}`;
  const [pendingSubmission, setPendingSubmission] =
    useState<MoveSubmission | null>(() => {
      try {
        const saved = JSON.parse(
          localStorage.getItem(pendingKey) ?? "null",
        ) as MoveSubmission | null;
        return f.source.kind === "nessie" &&
          saved?.customerId === f.source.customerId &&
          saved.month === f.month
          ? saved
          : null;
      } catch {
        return null;
      }
    });
  const [retry, setRetry] = useState(!!pendingSubmission);
  const [serverStale, setServerStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const input: MoveInput | null = useMemo(
    () =>
      f.data &&
      f.result &&
      f.data.playerId === f.result.baseline.playerId &&
      f.data.playerId ===
        (f.source.kind === "nessie"
          ? `nessie:${f.source.customerId}`
          : `seed:${f.source.persona}-cust`)
        ? {
            data: f.data,
            asOf: f.asOf,
            lockedBaseline: f.result.baseline,
            confirmations: f.confirmations,
            overrides: f.overrides,
          }
        : null,
    [f.data, f.result, f.asOf, f.confirmations, f.overrides, f.source],
  );
  const purchases = useMemo(() => (input ? movePurchases(input) : []), [input]);
  const bills =
    input?.data.obligations.filter(
      (o) =>
        o.dueDate.startsWith(month) &&
        o.dueDate <= f.asOf &&
        ["due", "overdue"].includes(o.status),
    ) ?? [];
  const selectedBill = bills.find((b) => b.id === billId) ?? bills[0];
  const selectedPurchase =
    purchases.find((p) => p.id === purchaseId) ?? purchases[0];
  const draft = JSON.stringify({
    kind,
    amount,
    category,
    bill: selectedBill?.id,
    purchase: selectedPurchase?.id,
  });
  const fingerprint = input ? moveSnapshot(input) : "";
  const stale =
    !!preview &&
    (serverStale ||
      preview.fingerprint !== fingerprint ||
      previewDraft !== draft);
  const active = month === f.month;
  const controlsPlayer =
    !!f.data &&
    cloud.status === "ready" &&
    cloud.leaguePlayers.some(
      (p) =>
        p.playerKey === f.data!.playerId &&
        p.owner.toHexString() === cloud.identityHex,
    );
  const executionReason = !active
    ? "Finalized months are read-only."
    : !involvesPlayer
      ? "Browse your own matchup to confirm a move."
      : f.source.kind !== "nessie"
        ? "Offline sample · preview only."
        : !controlsPlayer
          ? "Connect to SpacetimeDB and control this player to execute."
          : preview?.executionLimitation;
  const close = (restore = true) => {
    setOpen(false);
    if (restore) requestAnimationFrame(() => trigger.current?.focus());
  };
  usePositionEffect(() => {
    if (!open) return;
    const position = () => {
      const r = trigger.current?.getBoundingClientRect();
      if (!r) return;
      setMobile(window.innerWidth <= 650);
      const width = Math.min(600, window.innerWidth - 32);
      const below = window.innerHeight - r.bottom - 28,
        aboveSpace = r.top - 28;
      const above = below < 260 && aboveSpace > below;
      const left = Math.min(
        Math.max(16, r.left),
        window.innerWidth - width - 16,
      );
      const maxHeight = Math.max(160, above ? aboveSpace : below);
      setPlacement({
        left,
        width,
        maxHeight,
        top: above ? r.top - 12 : r.bottom + 12,
        pointer: Math.min(
          width - 24,
          Math.max(24, r.left + r.width / 2 - left),
        ),
        above,
      });
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() =>
      panel.current?.querySelector<HTMLElement>(".move-close")?.focus(),
    );
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
      if (e.key === "Tab") {
        const controls = [
          ...(panel.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]',
          ) ?? []),
        ];
        const first = controls[0],
          last = controls.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    const outside = (e: PointerEvent) => {
      if (
        !panel.current?.contains(e.target as Node) &&
        !trigger.current?.contains(e.target as Node)
      )
        close(
          !(
            e.target instanceof Element &&
            e.target.closest("button,input,select,a,[tabindex]")
          ),
        );
    };
    document.addEventListener("keydown", key, true);
    document.addEventListener("pointerdown", outside);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);
  useEffect(() => {
    if (!open || !mobile) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
    };
  }, [open, mobile]);
  useEffect(() => {
  }, [draft, fingerprint, involvesPlayer, active]);
  const disabledReason = (action: Move["kind"]) =>
    action === "invest" && !f.result?.score.components.investing.eligible
      ? "Not eligible"
      : action === "bill" && !bills.length
        ? "No unpaid bills"
        : action === "return" && !purchases.length
          ? "No posted purchases"
          : action === "save" &&
              input?.data.accounts.filter((a) => a.type === "savings")
                .length !== 1
            ? "No unique savings account"
            : null;
  const doPreview = () => {
    setError(null);
    setSuccess(null);
    try {
      if (!input || !active)
        throw new Error(
          "Select the active month and wait for your finances to load.",
        );
      const amountCents = /^\d+(\.\d{0,2})?$/.test(amount.trim())
        ? Math.round(Number(amount) * 100)
        : 0;
      const move: Move =
        kind === "spend"
          ? { kind, category, amountCents }
          : kind === "bill"
            ? { kind, billId: selectedBill?.id ?? "" }
            : kind === "return"
              ? { kind, purchaseId: selectedPurchase?.id ?? "", amountCents }
              : { kind, amountCents };
      setPreview(simulateMove(input, move));
      setPreviewDraft(draft);
      setOperationId(crypto.randomUUID());
      setRetry(false);
      setServerStale(false);
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : "Unable to preview this move.");
    }
  };
  const commit = async () => {
    if (
      (!preview && !pendingSubmission) ||
      submitting.current ||
      executionReason ||
      (!retry && stale) ||
      f.source.kind !== "nessie"
    )
      return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    const submission: MoveSubmission = pendingSubmission ?? {
      confirmed: true, // clicking Confirm is the player's explicit confirmation
      operationId,
      customerId: f.source.customerId,
      month,
      fingerprint: preview!.fingerprint,
      move: preview!.move,
    };
    setPendingSubmission(submission);
    try {
      localStorage.setItem(pendingKey, JSON.stringify(submission));
    } catch {
      /* In-memory recovery still works. */
    }
    const clearPending = () => {
      setPendingSubmission(null);
      try {
        localStorage.removeItem(pendingKey);
      } catch {
        /* Storage unavailable. */
      }
    };
    let received = false;
    try {
      const response = await fetch("/api/sandbox-moves", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${readToken() ?? ""}`,
        },
        body: JSON.stringify(submission),
      });
      const result = await response.json();
      received = true;
      if (!response.ok) {
        setRetry(true);
        if (result.code === "stale") {
          clearPending();
          setRetry(false);
          setServerStale(true);
          void f.refreshNessie?.().catch(() => {});
        }
        if (response.status === 400 || response.status === 422) {
          clearPending();
          setRetry(false);
        }
        throw new Error(result.error ?? "The move was not confirmed.");
      }
      setRetry(false);
      clearPending();
      setPreview(null);
      setSuccess(
        `Move saved and live score published: ${percent(result.efficiencyPct)}.`,
      );
      try {
        await f.refreshNessie?.();
      } catch {
        setError("Move saved and published; local refresh is pending.");
      }
    } catch (e) {
      if (!received) setRetry(true);
      setError(
        e instanceof Error
          ? e.message
          : "Unable to confirm the move. No success was recorded.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  const delta = preview?.percentagePointDelta ?? 0;
  const actualMargin =
    preview?.after.score.efficiencyPct != null && opponent?.actual != null
      ? preview.after.score.efficiencyPct - opponent.actual
      : null;
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="make-move-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <MoveSparkles />
        <span>Make a Move</span>
      </button>
      {open &&
        createPortal(
          <>
            {mobile && (
              <div
                className="make-move-backdrop"
                aria-hidden="true"
                onClick={() => close()}
              />
            )}
            <div
              ref={panel}
              id={id}
              className={`make-move-popover ${mobile ? "is-mobile" : placement.above ? "is-above" : ""}`}
              style={
                mobile
                  ? undefined
                  : ({
                      left: placement.left,
                      top: placement.top,
                      width: placement.width,
                      maxHeight: placement.maxHeight,
                      "--move-pointer": `${placement.pointer}px`,
                    } as React.CSSProperties)
              }
              role="dialog"
              aria-modal={mobile}
              aria-labelledby={`${id}-title`}
              aria-describedby={`${id}-description`}
            >
              <div className="move-panel-surface">
                <header className="move-header">
                  <div>
                    <h2 id={`${id}-title`}>
                      <MoveSparkles />
                      Make a Move
                    </h2>
                    <p id={`${id}-description`}>
                      Test a financial decision and see how it could change the
                      matchup.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="move-close"
                    aria-label="Close Make a Move"
                    onClick={() => close()}
                  >
                    ×
                  </button>
                </header>
                <div className="move-content">
                  <p className="move-player">
                    {f.data?.displayName ?? "Loading player…"} ·{" "}
                    {monthTitle(month)}
                  </p>
                  {pendingSubmission && !preview && (
                    <div className="move-notice" role="status">
                      Unfinished move:{" "}
                      {
                        actions.find(
                          (a) => a.kind === pendingSubmission.move.kind,
                        )?.title
                      }{" "}
                      {pendingSubmission.move.kind === "bill"
                        ? ""
                        : formatCents(pendingSubmission.move.amountCents)}
                      . Resume without sending a duplicate.
                      <button
                        type="button"
                        className="move-commit-button"
                        disabled={busy || !!executionReason}
                        onClick={() => void commit()}
                      >
                        {busy ? "Reconciling…" : "Resume"}
                      </button>
                      {executionReason && <p>{executionReason}</p>}
                    </div>
                  )}
                  {!active && (
                    <p className="move-notice">
                      Finalized month — select the current month to make a move.
                    </p>
                  )}
                  {!involvesPlayer && (
                    <p className="move-notice">
                      Previewing your own finances. This displayed matchup
                      belongs to other players.
                    </p>
                  )}
                  <div
                    className="move-actions"
                    role="group"
                    aria-label="Choose a financial action"
                  >
                    {actions.map((action) => (
                      <button
                        key={action.kind}
                        type="button"
                        className={`move-action ${kind === action.kind ? "is-selected" : ""}`}
                        aria-pressed={kind === action.kind}
                        disabled={
                          busy ||
                          retry ||
                          !active ||
                          !input ||
                          !!disabledReason(action.kind)
                        }
                        onClick={() => {
                          setKind(action.kind);
                          setError(null);
                        }}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d={action.path} />
                        </svg>
                        <strong>{action.title}</strong>
                        <small>
                          {disabledReason(action.kind) ?? action.subtitle}
                        </small>
                      </button>
                    ))}
                  </div>
                  <form
                    className="move-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      doPreview();
                    }}
                  >
                    {kind === "bill" ? (
                      <label className="move-choice">
                        Unpaid bill
                        <select
                          aria-label="Unpaid bill"
                          disabled={busy || retry || !active}
                          value={selectedBill?.id ?? ""}
                          onChange={(e) => setBillId(e.target.value)}
                        >
                          {bills.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.payee} · {formatCents(b.amountCents)} · due{" "}
                              {b.dueDate}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <label>
                        Amount ($)
                        <input
                          aria-label="Move amount"
                          inputMode="decimal"
                          value={amount}
                          disabled={busy || retry || !active}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder="0.00"
                        />
                      </label>
                    )}
                    {kind === "spend" && (
                      <label>
                        Category
                        <select
                          aria-label="Move category"
                          value={category}
                          disabled={busy || retry || !active}
                          onChange={(e) =>
                            setCategory(e.target.value as DiscretionaryCategory)
                          }
                        >
                          {DISCRETIONARY_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {categoryLabel(c)}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {kind === "return" && (
                      <label className="move-choice">
                        Purchase
                        <select
                          aria-label="Purchase to refund"
                          disabled={busy || retry || !active}
                          value={selectedPurchase?.id ?? ""}
                          onChange={(e) => setPurchaseId(e.target.value)}
                        >
                          {purchases.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.occurredAt} · {p.merchantName ?? p.description}{" "}
                              ·{" "}
                              {formatCents(
                                refundableCents(p, f.result!.transactions),
                              )}{" "}
                              left
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <button
                      type="submit"
                      className="move-preview-button"
                      disabled={busy || retry || !active || !input}
                    >
                      <svg
                        width="10"
                        height="12"
                        viewBox="0 0 10 12"
                        aria-hidden="true"
                      >
                        <path d="M1 1 9 6 1 11Z" fill="currentColor" />
                      </svg>{" "}
                      Preview Impact
                    </button>
                  </form>
                  {error && (
                    <p className="move-error" role="alert">
                      {error}
                    </p>
                  )}
                  {preview && (
                    <section
                      className={`move-impact ${stale ? "is-stale" : delta > 0 ? "is-positive" : delta < 0 ? "is-negative" : "is-neutral"}`}
                      aria-label="Projected Impact — Hypothetical"
                      aria-live="polite"
                    >
                      <h3>
                        Projected Impact <span>Hypothetical</span>
                      </h3>
                      {stale && (
                        <p className="move-stale">
                          Your inputs or finances changed. Preview again before
                          confirming.
                        </p>
                      )}
                      <div className="move-efficiency">
                        <span>
                          <small>Current efficiency</small>
                          <strong>
                            {percent(preview.before.score.efficiencyPct)}
                          </strong>
                        </span>
                        <span aria-hidden="true">→</span>
                        <span>
                          <small>After move</small>
                          <strong>
                            {percent(preview.after.score.efficiencyPct)}
                          </strong>
                        </span>
                        <b>
                          {preview.percentagePointDelta === null
                            ? "—"
                            : `${signed(delta)} pp`}
                        </b>
                      </div>
                      <p className="move-position">
                        {positionLabel(preview.affected)} ·{" "}
                        {preview.beforePosition?.earned.toFixed(1) ?? "—"} →{" "}
                        {preview.afterPosition?.earned.toFixed(1) ?? "—"}{" "}
                        position pts
                      </p>
                      <p className="move-position">
                        Total earned:{" "}
                        {preview.before.score.earnedPoints.toFixed(1)} /{" "}
                        {preview.before.score.availablePoints} →{" "}
                        {preview.after.score.earnedPoints.toFixed(1)} /{" "}
                        {preview.after.score.availablePoints} pts (
                        {signed(preview.rawPointDelta)})
                      </p>
                      <p className="move-explanation">{preview.explanation}</p>
                      {involvesPlayer && opponent ? (
                        <div className="move-matchup">
                          <p>
                            Actual margin vs {opponent.name}:{" "}
                            <strong>
                              {preview.before.score.efficiencyPct == null ||
                              opponent.actual == null
                                ? "Unavailable"
                                : `${signed(preview.before.score.efficiencyPct - opponent.actual)} pp`}{" "}
                              →{" "}
                              {actualMargin === null
                                ? "Unavailable"
                                : `${signed(actualMargin)} pp`}
                            </strong>
                          </p>
                          <p>
                            Projected leader:{" "}
                            <strong>
                              {preview.projectedBefore?.efficiencyPct != null &&
                              preview.projectedAfter?.efficiencyPct != null &&
                              opponent.projected != null
                                ? `${leader(preview.projectedBefore.efficiencyPct, opponent.projected, opponent.name)} → ${leader(preview.projectedAfter.efficiencyPct, opponent.projected, opponent.name)}`
                                : "Unavailable — both projections are required"}
                            </strong>
                          </p>
                        </div>
                      ) : null}
                      <p className="move-simulation-note">
                      {pendingSubmission ? "A move is still being saved — this preview remains hypothetical." : "Simulation only — no changes made."}
                      </p>
                    </section>
                  )}
                  {preview && !success && (
                    <div className="move-execution">
                      {executionReason ? (
                        <p className="move-notice">{executionReason}</p>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="move-commit-button"
                            disabled={busy || (!retry && stale)}
                            onClick={() => void commit()}
                          >
                            {busy ? "Confirming…" : retry ? "Retry" : "Confirm"}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  {success && (
                    <p className="move-success" role="status">
                      {success}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

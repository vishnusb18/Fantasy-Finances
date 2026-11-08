import { runFinancePipeline, type PipelineInput } from "../finance/pipeline";
import { safeToMoveNowCents } from "../finance/affordability";
import { DEFAULT_POLICY } from "../finance/policy";
import {
  DISCRETIONARY_CATEGORIES,
  type DiscretionaryCategory,
  type NormalizedTransaction,
  type ScoringBaseline,
} from "../finance/types";
import { monthOf, round1 } from "../finance/util";
import { positions, projectMonthEndScore } from "./engine";

export type Move =
  | { kind: "spend"; amountCents: number; category: DiscretionaryCategory }
  | { kind: "save" | "invest"; amountCents: number }
  | { kind: "bill"; billId: string }
  | { kind: "return"; purchaseId: string; amountCents: number };
export type MoveInput = PipelineInput & { lockedBaseline: ScoringBaseline };
export type MoveSubmission = {
  confirmed: true;
  operationId: string;
  customerId: string;
  month: string;
  fingerprint: string;
  move: Move;
};
export const MOVE_MERCHANTS: Record<DiscretionaryCategory, string> = {
  dining_out: "DoorDash",
  nightlife: "Truck Yard Bar",
  entertainment: "AMC Theatres",
  shopping: "Target",
  subscriptions: "Spotify",
};
export class MoveError extends Error {}
/** Shared pure evaluator for browser previews and the existing bot's copied Nessie bundles. */
export const scoreMoveData = (input: PipelineInput) =>
  runFinancePipeline(input);

export function refundableCents(
  purchase: NormalizedTransaction,
  transactions: NormalizedTransaction[],
) {
  const marker = `[purchase:${purchase.sourceTransactionId ?? purchase.id}]`;
  const refunded = transactions
    .filter(
      (t) =>
        t.kind === "refund" &&
        t.occurredAt >= purchase.occurredAt &&
        (t.description?.includes(marker) ||
          (!t.description?.includes("[purchase:") &&
            t.category === purchase.category &&
            t.accountId === purchase.accountId)),
    )
    .reduce((sum, t) => sum + Math.abs(t.amountCents), 0);
  return Math.max(0, Math.abs(purchase.amountCents) - refunded);
}
export function movePurchases(input: MoveInput) {
  const current = scoreMoveData(input);
  return current.transactions.filter(
    (t) =>
      t.kind === "expense" &&
      !t.pending &&
      t.amountCents < 0 &&
      t.occurredAt <= input.asOf &&
      DISCRETIONARY_CATEGORIES.includes(t.category as DiscretionaryCategory) &&
      !!t.sourceTransactionId &&
      !!t.merchantName &&
      refundableCents(t, current.transactions) > 0,
  );
}
/** Order-independent snapshot of every input affecting a preview, never sent to the public league. */
export function moveSnapshot(input: MoveInput) {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, canonical(x)]),
          )
        : v;
  const sorted = <T extends { id: string }>(items: T[]) =>
    [...items].sort((a, b) => a.id.localeCompare(b.id));
  const data = {
    ...input.data,
    accounts: sorted(input.data.accounts),
    transactions: sorted(input.data.transactions),
    obligations: sorted(input.data.obligations),
  };
  const json = JSON.stringify(
    canonical({
      data,
      asOf: input.asOf,
      baseline: input.lockedBaseline,
      overrides: [...(input.overrides ?? [])]
        .map(({ transactionId, category }) => ({ transactionId, category }))
        .sort((a, b) => a.transactionId.localeCompare(b.transactionId)),
      confirmations: input.confirmations ?? {},
      policy: input.policy ?? DEFAULT_POLICY,
    }),
  );
  let a = 2166136261,
    b = 5381;
  for (let i = 0; i < json.length; i++) {
    a = Math.imul(a ^ json.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ json.charCodeAt(i);
  }
  return `${a >>> 0}-${b >>> 0}`;
}
export function simulateMove(
  input: MoveInput,
  move: Move,
  operationId = "preview",
) {
  const baseline = input.lockedBaseline;
  if (
    baseline.status !== "locked" ||
    baseline.month !== monthOf(input.asOf) ||
    baseline.playerId !== input.data.playerId
  )
    throw new MoveError(
      "A locked baseline for this player and month is required.",
    );
  const before = scoreMoveData(input);
  const checking = input.data.accounts.find((a) => a.type === "checking");
  const savings = input.data.accounts.filter((a) => a.type === "savings");
  if (!checking) throw new MoveError("A checking account is required.");
  const bills = before.profile.obligations;
  const bill =
    move.kind === "bill"
      ? input.data.obligations.find(
          (o) =>
            o.id === move.billId &&
            o.dueDate.startsWith(baseline.month) &&
            o.dueDate <= input.asOf &&
            (o.status === "due" || o.status === "overdue"),
        )
      : undefined;
  if (move.kind === "bill" && !bill)
    throw new MoveError("Choose an unpaid bill that has come due this month.");
  const amountCents =
    move.kind === "bill" ? bill!.amountCents : move.amountCents;
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0)
    throw new MoveError("Enter a positive amount in dollars and cents.");
  if (
    move.kind === "spend" &&
    !DISCRETIONARY_CATEGORIES.includes(move.category)
  )
    throw new MoveError("Choose a supported discretionary category.");
  if (move.kind === "save" && savings.length !== 1)
    throw new MoveError("One identifiable savings account is required.");
  if (
    move.kind === "invest" &&
    (!baseline.investing.eligible ||
      !before.score.components.investing.eligible)
  )
    throw new MoveError(
      "Not eligible for investing points under this locked baseline.",
    );
  const purchase =
    move.kind === "return"
      ? movePurchases(input).find((t) => t.id === move.purchaseId)
      : undefined;
  if (
    move.kind === "return" &&
    (!purchase || amountCents > refundableCents(purchase, before.transactions))
  )
    throw new MoveError(
      "Choose a posted purchase and an amount within its remaining refundable balance.",
    );
  const policy = input.policy ?? DEFAULT_POLICY;
  const reserve = before.profile.reserveAllocationCents ?? 0;
  const liquidity = safeToMoveNowCents(before.profile, policy);
  const spendable =
    liquidity === null
      ? 0
      : Math.max(0, liquidity - reserve + (bill?.amountCents ?? 0));
  if (
    move.kind !== "return" &&
    (bills.some((o) => o.status === "unknown") ||
      amountCents > spendable ||
      amountCents > checking.balanceCents)
  )
    throw new MoveError(
      "Insufficient safe cash after unpaid bills, reserve and the minimum cash floor.",
    );
  const marker = `[ff-move:${operationId}]`;
  const affected =
    move.kind === "spend"
      ? move.category
      : move.kind === "save"
        ? "savings"
        : move.kind === "invest"
          ? "investing"
          : move.kind === "return"
            ? purchase!.category
            : "bills";
  const accountId = purchase?.accountId ?? checking.id;
  const tx: NormalizedTransaction = {
    id: `move:${operationId}`,
    sourceTransactionId: `move:${operationId}`,
    playerId: input.data.playerId,
    source: input.data.source,
    occurredAt: input.asOf,
    amountCents: move.kind === "return" ? amountCents : -amountCents,
    accountId,
    category:
      move.kind === "spend"
        ? move.category
        : move.kind === "save"
          ? "savings_transfer"
          : move.kind === "invest"
            ? "investment_contribution"
            : move.kind === "return"
              ? purchase!.category
              : bill!.kind === "debt_minimum"
                ? "debt_payment"
                : "other",
    kind:
      move.kind === "return"
        ? "refund"
        : move.kind === "save" || move.kind === "invest"
          ? "transfer"
          : move.kind === "bill"
            ? "payment"
            : "expense",
    pending: false,
    confidence: "high",
    categorySource: "rule",
    ...(move.kind === "spend"
      ? { merchantName: MOVE_MERCHANTS[move.category] }
      : {}),
    ...(move.kind === "save"
      ? { isInternalTransfer: true, counterpartyAccountId: savings[0].id }
      : {}),
    description:
      move.kind === "return"
        ? `Refund: ${MOVE_MERCHANTS[purchase!.category as DiscretionaryCategory]} [purchase:${purchase!.sourceTransactionId}] ${marker}`
        : move.kind === "save"
          ? `Transfer to savings ${marker}`
          : move.kind === "invest"
            ? `Vanguard Roth IRA contribution ${marker}`
            : move.kind === "bill"
              ? `Bill payment ${marker}`
              : `Sandbox purchase ${marker}`,
  };
  const data = {
    ...input.data,
    transactions: [...input.data.transactions, tx],
    obligations: input.data.obligations.map((o) =>
      o.id === bill?.id ? { ...o, status: "paid" as const } : o,
    ),
    accounts: input.data.accounts.map((a) => ({
      ...a,
      balanceCents:
        a.balanceCents +
        (move.kind === "return" && a.id === accountId
          ? a.type === "credit_card"
            ? -amountCents
            : amountCents
          : move.kind === "save" && a.id === savings[0].id
            ? amountCents
            : a.id === checking.id && move.kind !== "return"
              ? -amountCents
              : 0),
    })),
  };
  const after = scoreMoveData({ ...input, data });
  const project = (r: typeof before, d: typeof data) =>
    projectMonthEndScore({
      profile: r.profile,
      baseline,
      transactions: r.transactions,
      accounts: d.accounts,
      obligations: d.obligations,
      scoringPeriod: { month: baseline.month, asOf: input.asOf },
      policy,
    }).score;
  const beforePosition = positions(before.score).find(
    (p) => p.key === affected,
  );
  const afterPosition = positions(after.score).find((p) => p.key === affected);
  return {
    move,
    amountCents,
    before,
    after,
    data,
    transaction: tx,
    affected,
    fingerprint: moveSnapshot(input),
    projectedBefore: project(before, input.data),
    projectedAfter: project(after, data),
    percentagePointDelta:
      before.score.efficiencyPct === null || after.score.efficiencyPct === null
        ? null
        : round1(after.score.efficiencyPct - before.score.efficiencyPct),
    rawPointDelta: round1(after.score.earnedPoints - before.score.earnedPoints),
    explanation:
      (move.kind === "spend" || move.kind === "return"
        ? after.score.components.spending.explanations[0]
        : afterPosition?.explanation) ??
      "Calculated against your locked baseline.",
    beforePosition,
    afterPosition,
    executionLimitation:
      move.kind === "bill"
        ? "Bill settlement is preview-only; the sandbox cannot atomically debit cash and settle a bill."
        : move.kind === "return" &&
            input.data.accounts.find((a) => a.id === accountId)?.type !==
              "checking"
          ? "Refunds to credit cards are preview-only in this sandbox."
          : null,
  };
}
export type MovePreview = ReturnType<typeof simulateMove>;

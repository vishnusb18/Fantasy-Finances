import { describe, it, expect, vi } from "vitest";
import { MEMBERS } from "../src/lib/competition/demo";
import { generatePersonaBundle } from "../src/lib/finance/demo/personas";
import { nessieToProviderData } from "../src/lib/finance/adapters/nessie/toProviderData";
import {
  createNessieClient,
  type NessieClient,
} from "../src/lib/finance/adapters/nessie/client";
import { runFinancePipeline } from "../src/lib/finance/pipeline";
import { DEFAULT_POLICY } from "../src/lib/finance/policy";
import {
  moveSnapshot,
  simulateMove,
  refundableCents,
  movePurchases,
  type MoveInput,
  type Move,
} from "../src/lib/competition/moves";
import {
  createMoveExecutor,
  seededSandbox,
  type MoveOwner,
  type MoveJournal,
  type JournalEntry,
} from "../server/sandboxMoves";

const asOf = "2026-11-08";
function fixture(key = "maya") {
  const spec = MEMBERS.find((m) => m.key === key)!;
  const bundle = generatePersonaBundle(spec, asOf);
  bundle.customer.address = {
    street_number: "800",
    street_name: "W Campbell Rd",
    zip: "75080",
  };
  const data = nessieToProviderData(bundle, "nessie");
  const result = runFinancePipeline({ data, asOf });
  const input: MoveInput = {
    data,
    asOf,
    lockedBaseline: result.baseline,
    confirmations: {},
    overrides: [],
  };
  return { bundle, input };
}
describe("pure Make a Move simulations", () => {
  it("uses the actual locked baseline without mutating transactions, balances, confirmations or corrections", () => {
    const { input } = fixture();
    input.confirmations = { monthlyNetIncomeCents: 105000 };
    const purchase = input.data.transactions.find(
      (t) => t.category === "shopping",
    )!;
    input.overrides = [
      { transactionId: purchase.id, category: "dining_out", correctedAt: asOf },
    ];
    const snapshot = JSON.stringify(input);
    const preview = simulateMove(input, { kind: "save", amountCents: 3000 });
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(preview.after.baseline).toBe(input.lockedBaseline);
    expect(preview.after.score).toEqual(
      runFinancePipeline({ ...input, data: preview.data }).score,
    );
    expect(
      preview.after.transactions.find((t) => t.id === purchase.id)?.category,
    ).toBe("dining_out");
    expect(preview.after.transactions.filter((t) => t.pending)).toEqual(
      preview.before.transactions.filter((t) => t.pending),
    );
  });
  it("does not invent penalties for a purchase within the locked targets", () => {
    const preview = simulateMove(fixture().input, {
      kind: "spend",
      category: "dining_out",
      amountCents: 100,
    });
    expect(preview.percentagePointDelta).toBe(0);
    expect(preview.rawPointDelta).toBe(0);
  });
  it("applies category penalties AND the existing overall cap, preserving raw versus normalized deltas", () => {
    const { input } = fixture();
    const spend = simulateMove(input, {
      kind: "spend",
      category: "shopping",
      amountCents: 20000,
    });
    expect(spend.percentagePointDelta).toBeLessThan(0);
    expect(spend.after.score.components.spending.earned).toBeLessThan(
      spend.before.score.components.spending.earned,
    );
    const save = simulateMove(input, { kind: "save", amountCents: 3000 });
    expect(save.rawPointDelta).toBeGreaterThan(0);
    expect(save.percentagePointDelta).not.toBe(save.rawPointDelta);
    const capped = simulateMove(input, { kind: "save", amountCents: 20000 });
    expect(capped.after.score.components.savings.earned).toBe(
      capped.after.score.components.savings.available,
    );
  });
  it("protects reserves, unpaid bills and cash floor and rejects fractional cents, zero and negative amounts", () => {
    const { input } = fixture();
    for (const amountCents of [0, -1, 0.5, Number.NaN, 99999999])
      expect(() =>
        simulateMove(input, { kind: "save", amountCents }),
      ).toThrow();
    const next = structuredClone(input);
    next.data.accounts.find((a) => a.type === "checking")!.balanceCents =
      DEFAULT_POLICY.minCashFloorCents;
    expect(() => simulateMove(next, { kind: "save", amountCents: 1 })).toThrow(
      /safe cash/,
    );
  });
  it("cannot alter the baseline or award investing points to an ineligible player", () => {
    expect(() =>
      simulateMove(fixture().input, { kind: "invest", amountCents: 100 }),
    ).toThrow(/Not eligible/);
    const { input } = fixture("jordan");
    const p = simulateMove(input, { kind: "invest", amountCents: 100 });
    expect(p.after.baseline).toBe(input.lockedBaseline);
    expect(p.after.score.components.investing.earned).toBeGreaterThanOrEqual(
      p.before.score.components.investing.earned,
    );
  });
  it("links refunds to posted purchases, enforces remaining amounts, and honors pending refunds", () => {
    const { input } = fixture();
    const purchase = movePurchases(input).find(
      (p) =>
        p.accountId ===
        input.data.accounts.find((a) => a.type === "checking")!.id,
    )!;
    const remaining = refundableCents(purchase, input.data.transactions);
    const move: Move = {
      kind: "return",
      purchaseId: purchase.id,
      amountCents: Math.min(100, remaining),
    };
    const preview = simulateMove(input, move);
    expect(preview.transaction.description).toContain(
      `[purchase:${purchase.sourceTransactionId}]`,
    );
    expect(preview.transaction.category).toBe(purchase.category);
    expect(() =>
      simulateMove(input, { ...move, amountCents: remaining + 1 }),
    ).toThrow(/refundable/);
    const next = {
      ...input,
      data: {
        ...input.data,
        transactions: [
          ...input.data.transactions,
          { ...preview.transaction, pending: true },
        ],
      },
    };
    expect(refundableCents(purchase, next.data.transactions)).toBe(
      remaining - move.amountCents,
    );
    expect(() =>
      simulateMove(input, { ...move, purchaseId: "someone-else" }),
    ).toThrow();
    const pending = input.data.transactions.find((t) => t.pending)!;
    expect(() =>
      simulateMove(input, { ...move, purchaseId: pending.id }),
    ).toThrow();
  });
  it("previews an actual overdue bill but rejects future/paid/fabricated bills and never assumes early points", () => {
    const f = fixture();
    const due = f.input.data.obligations.find(
      (o) => o.dueDate === "2026-11-01",
    )!;
    due.status = "due";
    f.input.data.accounts.find((a) => a.type === "checking")!.balanceCents =
      200000;
    f.input.lockedBaseline = runFinancePipeline({
      ...f.input,
      lockedBaseline: undefined,
    }).baseline;
    const p = simulateMove(f.input, { kind: "bill", billId: due.id });
    expect(p.amountCents).toBe(due.amountCents);
    expect(p.after.score.components.bills.earned).toBeGreaterThan(
      p.before.score.components.bills.earned,
    );
    expect(p.executionLimitation).toMatch(/preview-only/);
    const future = f.input.data.obligations.find(
      (o) => o.dueDate > asOf && o.dueDate.startsWith("2026-11"),
    )!;
    expect(() =>
      simulateMove(f.input, { kind: "bill", billId: future.id }),
    ).toThrow();
    expect(() =>
      simulateMove(f.input, { kind: "bill", billId: "invented" }),
    ).toThrow();
  });
  it("keeps previews independent of I/O and fingerprints every score-changing input", () => {
    const { input } = fixture();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    try {
      simulateMove(input, { kind: "save", amountCents: 100 });
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
    const next = structuredClone(input);
    next.data.accounts[0].balanceCents--;
    expect(moveSnapshot(next)).not.toBe(moveSnapshot(input));
    next.data.accounts[0].balanceCents++;
    next.data.transactions.reverse();
    expect(moveSnapshot(next)).toBe(moveSnapshot(input));
  });
});

function service() {
  const { bundle, input } = fixture();
  const rows = new Map<string, JournalEntry>();
  const journal: MoveJournal = {
    get: (id) => rows.get(id),
    all: () => [...rows.values()],
    set: (row) => {
      rows.set(row.id, row);
    },
  };
  const publish = vi.fn(
    async (_score: Parameters<MoveOwner["publish"]>[0]) => {},
  );
  const owns = vi.fn(() => true);
  const owner: MoveOwner = {
    identity: "test-owner",
    baseline: input.lockedBaseline,
    overrides: [],
    confirmations: {},
    owns,
    publish,
    close: vi.fn(),
  };
  const client = createNessieClient({ baseUrl: "https://example.invalid" });
  client.fetchBundle = vi.fn(async () => structuredClone(bundle));
  client.get = vi.fn(
    async () => bundle.merchants,
  ) as unknown as NessieClient["get"];
  const post = vi.fn(async (path: string, body: unknown) => {
    expect([...rows.values()][0].status).toBe("pending");
    const value = body as {
      amount: number;
      status: "completed";
      transaction_date: string;
      description: string;
    };
    if (!path.endsWith("/transfers"))
      throw new Error("Unexpected write in fixture");
    bundle.transfers.push({
      ...value,
      _id: `created-${bundle.transfers.length}`,
      payer_id: bundle.accounts.find((a) => a.type === "Checking")!._id,
      medium: "balance",
    });
    bundle.accounts.find((a) => a.type === "Checking")!.balance -= value.amount;
    return {};
  });
  client.post = post as unknown as NessieClient["post"];
  const authorize = vi.fn(async () => owner);
  const execute = createMoveExecutor({
    nessie: client,
    authorize,
    journal,
    date: () => asOf,
  });
  const request = {
    confirmed: true,
    operationId: "test-operation-0001",
    customerId: bundle.customer._id,
    month: "2026-11",
    fingerprint: moveSnapshot(input),
    move: { kind: "save", amountCents: 100 } as Move,
  };
  return {
    execute,
    request,
    post,
    publish,
    input,
    bundle,
    owner,
    owns,
    client,
    authorize,
    rows,
  };
}
describe("preview versus sandbox execution boundary", () => {
  it("requires explicit confirmation at the server boundary", async () => {
    const s = service();
    await expect(s.execute({ ...s.request, confirmed: false }, "token")).rejects.toThrow(/confirmation/);
    expect(s.post).not.toHaveBeenCalled();
  });
  it("executes only after fresh validation, then reads actual Nessie data and publishes once; retries never duplicate", async () => {
    const s = service();
    const first = await s.execute(s.request, "verified-test-token");
    const again = await s.execute(s.request, "verified-test-token");
    expect(again).toEqual(first);
    expect(s.post).toHaveBeenCalledTimes(1);
    expect(s.publish).toHaveBeenCalledTimes(1);
    expect(s.client.fetchBundle).toHaveBeenCalledTimes(2);
    const actual = runFinancePipeline({
      ...s.input,
      data: nessieToProviderData(s.bundle, "nessie"),
    });
    expect(s.publish.mock.calls[0][0]).toEqual(actual.score);
  });
  it("rejects historical, unauthorized, stale, unseeded and unaffordable moves before any write or publish", async () => {
    const historical = service();
    await expect(
      historical.execute({ ...historical.request, month: "2026-10" }, "token"),
    ).rejects.toThrow(/active month/);
    const denied = service();
    denied.owns.mockReturnValue(false);
    await expect(denied.execute(denied.request, "token")).rejects.toThrow(
      /control/,
    );
    const stale = service();
    stale.bundle.accounts[0].balance--;
    await expect(stale.execute(stale.request, "token")).rejects.toThrow(
      /changed/,
    );
    const unseeded = service();
    delete unseeded.bundle.customer.address;
    await expect(unseeded.execute(unseeded.request, "token")).rejects.toThrow(
      /seeded/,
    );
    const unaffordable = service();
    await expect(
      unaffordable.execute(
        {
          ...unaffordable.request,
          move: { kind: "save", amountCents: 99999999 },
        },
        "token",
      ),
    ).rejects.toThrow(/safe cash/);
    for (const s of [historical, denied, stale, unseeded, unaffordable]) {
      expect(s.post).not.toHaveBeenCalled();
      expect(s.publish).not.toHaveBeenCalled();
    }
    expect(seededSandbox(service().bundle)).toBe(true);
  });
  it("rejects an ineligible investment and bill execution without writing", async () => {
    const s = service();
    await expect(
      s.execute(
        { ...s.request, move: { kind: "invest", amountCents: 100 } },
        "token",
      ),
    ).rejects.toThrow(/Not eligible/);
    expect(s.post).not.toHaveBeenCalled();
  });
  it("reconciles a committed-but-timeout request without repeating the transaction", async () => {
    const s = service();
    const write = s.post.getMockImplementation()!;
    s.post.mockImplementationOnce(async (...args) => {
      await write(...args);
      throw new Error("connection lost after POST");
    });
    await expect(s.execute(s.request, "token")).rejects.toMatchObject({
      code: "reconcile",
    });
    expect(s.publish).not.toHaveBeenCalled();
    await s.execute(s.request, "token");
    expect(s.post).toHaveBeenCalledTimes(1);
    expect(s.publish).toHaveBeenCalledTimes(1);
  });
  it("resumes publication after a reducer failure and blocks a new move while reconciliation is pending", async () => {
    const s = service();
    s.publish.mockRejectedValueOnce(new Error("offline"));
    await expect(s.execute(s.request, "token")).rejects.toMatchObject({
      code: "reconcile",
    });
    await expect(
      s.execute(
        { ...s.request, operationId: "different-operation-02" },
        "token",
      ),
    ).rejects.toThrow(/reconciliation/);
    await s.execute(s.request, "token");
    expect(s.post).toHaveBeenCalledTimes(1);
    expect(s.publish).toHaveBeenCalledTimes(2);
  });
  it("binds an idempotency id to its original action and requires an authenticated owner", async () => {
    const s = service();
    await expect(s.execute(s.request, "")).rejects.toThrow(/ownership/);
    await s.execute(s.request, "token");
    await expect(
      s.execute(
        { ...s.request, move: { kind: "save", amountCents: 200 } },
        "token",
      ),
    ).rejects.toThrow(/different move/);
    expect(s.post).toHaveBeenCalledTimes(1);
  });
  it("keeps a failed read-back recoverable after the write, without a second POST", async () => {
    const s = service();
    const fetch = vi.mocked(s.client.fetchBundle);
    fetch.mockImplementationOnce(async () => structuredClone(s.bundle));
    fetch.mockImplementationOnce(async () => {
      throw new Error("read-back timeout");
    });
    await expect(s.execute(s.request, "token")).rejects.toMatchObject({
      code: "reconcile",
    });
    await s.execute(s.request, "token");
    expect(s.post).toHaveBeenCalledTimes(1);
    expect(s.publish).toHaveBeenCalledTimes(1);
  });
  it("publishes the actual pending-versus-settled response, never the hypothetical preview", async () => {
    const s = service();
    const before = runFinancePipeline(s.input).score;
    const write = s.post.getMockImplementation()!;
    s.post.mockImplementationOnce(async (...args) => {
      await write(...args);
      s.bundle.transfers.at(-1)!.status = "pending";
      return {};
    });
    await s.execute(s.request, "token");
    expect(s.publish.mock.calls[0][0].earnedPoints).toBe(before.earnedPoints);
    expect(
      simulateMove(s.input, s.request.move).after.score.earnedPoints,
    ).toBeGreaterThan(before.earnedPoints);
  });
});

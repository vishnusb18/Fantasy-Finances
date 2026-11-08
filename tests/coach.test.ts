import { describe, it, expect, vi } from "vitest";
import { buildMatchupContext } from "../server/coach/buildMatchupContext";
import {
  createCoachService,
  parseCoachRequest,
  coachError,
} from "../server/coach/coachRoutes";
import {
  LeagueSessionError,
  type LeagueSession,
} from "../server/leagueSession";
import {
  MEMBERS,
  buildSamplePeriod,
  buildLeague,
} from "../src/lib/competition/demo";
import { generatePersonaBundle } from "../src/lib/finance/demo/personas";
import { nessieToProviderData } from "../src/lib/finance/adapters/nessie/toProviderData";
import { runFinancePipeline } from "../src/lib/finance/pipeline";
import { simulateMove } from "../src/lib/competition/moves";
import { monthPairings } from "../src/lib/competition/pairings";
import { driftBounds } from "../src/app/coach/useDrifblimMotion";
const date = "2026-11-08";
function fixture() {
  const data = nessieToProviderData(
      generatePersonaBundle(MEMBERS[0], date),
      "nessie",
    ),
    result = runFinancePipeline({ data, asOf: date });
  const session = {
    identity: "coach-owner",
    playerKey: data.playerId,
    displayName: "Maya Chen",
    baseline: result.baseline,
    confirmations: {},
    overrides: [],
    players: MEMBERS.map((m) => ({
      playerKey: `nessie:${m.key}-cust`,
      displayName: `${m.firstName} ${m.lastName}`,
      source: "nessie",
    })),
    scores: MEMBERS.map((m) => {
      const score = buildSamplePeriod(m, "2026-11", date).result.score;
      return {
        playerKey: `nessie:${m.key}-cust`,
        month: "2026-11",
        status: score.status,
        efficiencyPct: score.efficiencyPct,
        earnedPoints: score.earnedPoints,
        availablePoints: score.availablePoints,
        categories: score.categoryLines.map((c) => ({
          category: c.category,
          earned: c.earned,
          available: c.available,
          eligible: c.eligible,
        })),
        updatedAt: "123",
      };
    }),
    controls: () => true,
    connection: {} as LeagueSession["connection"],
    close: vi.fn(),
  } satisfies LeagueSession;
  return { data, session };
}
describe("verified Drifblim context", () => {
  it("uses the real locked engine and existing round-robin opponent without leaking private data", () => {
    const { data, session } = fixture();
    const before = JSON.stringify(data);
    Object.assign(
      session.scores.find((s) => s.playerKey === "nessie:alex-cust")!,
      {
        transactions: [{ description: "OPPONENT_SECRET" }],
        balanceCents: 999999,
        income: 99999,
        savingsTarget: 88888,
      },
    );
    const context = buildMatchupContext(
      session,
      data,
      "2026-11",
      date,
      "What if I save $25?",
    );
    expect(context.opponent?.teamName).toBe("Alex Morgan");
    expect(JSON.stringify(context.opponent)).not.toMatch(
      /OPPONENT_SECRET|balanceCents|income|savingsTarget|transactions/,
    );
    expect(JSON.stringify(context)).not.toMatch(
      /account_number|estimatedMonthlyNetIncome|apiKey/,
    );
    const computed = simulateMove(
      {
        data,
        asOf: date,
        lockedBaseline: session.baseline,
        overrides: [],
        confirmations: {},
      },
      { kind: "save", amountCents: 2500 },
    );
    const scenario = context.scenarios.find(
      (s) => s.action === "save" && s.amountCents === 2500,
    )!;
    expect(scenario.percentagePointDelta).toBe(computed.percentagePointDelta);
    expect(scenario.rawEarnedPointDelta).toBe(computed.rawPointDelta);
    expect(JSON.stringify(data)).toBe(before);
  });
  it("marks ineligible or unaffordable scenarios unavailable instead of fabricating a gain", () => {
    const { data, session } = fixture();
    const context = buildMatchupContext(
      session,
      data,
      "2026-11",
      date,
      "What if I save $999999?",
    );
    expect(
      context.scenarios.find(
        (s) => s.action === "save" && s.amountCents === 99999900,
      )?.status,
    ).toBe("unavailable");
    expect(
      context.scenarios
        .filter((s) => s.action === "invest")
        .every((s) => s.status === "unavailable"),
    ).toBe(true);
    const known = runFinancePipeline({
      data,
      asOf: date,
      lockedBaseline: session.baseline,
    });
    expect(context.user.efficiencyPercent).toBe(known.score.efficiencyPct);
  });
  it("does not invent historical baselines, pending settlement, or missing opponent snapshots", () => {
    const { data, session } = fixture();
    const old = buildMatchupContext(
      { ...session, baseline: undefined, scores: [] },
      data,
      "2026-10",
      date,
      "Who leads?",
    );
    expect(old.user.efficiencyPercent).toBeNull();
    expect(old.opponent).toBeUndefined();
    expect(old.scenarios).toEqual([]);
    const pending = data.transactions.find((t) => t.pending)!;
    expect(pending.pending).toBe(true);
    expect(old.limitation).toMatch(/Historical/);
    const ownOnly = buildMatchupContext(
      { ...session, players: [] },
      data,
      "2026-11",
      date,
      "Help",
    );
    expect(ownOnly.opponent).toBeUndefined();
  });
  it("rejects foreign data even with a forged caller-supplied player identifier", () => {
    const { data, session } = fixture();
    expect(() =>
      buildMatchupContext(
        session,
        { ...data, playerId: "nessie:someone-else" },
        "2026-11",
        date,
        "Help",
      ),
    ).toThrow(/mismatch/);
    const parsed = parseCoachRequest({
      message: "Help",
      monthId: "2026-11",
      playerId: "forged",
      opponentId: "forged",
      balance: 100000,
    });
    expect(parsed).not.toHaveProperty("playerId");
    expect(parsed).not.toHaveProperty("balance");
  });
  it("uses identical matchup scheduling for all existing months", () => {
    const league = buildLeague(date);
    for (const [index, month] of league.months.entries())
      expect(monthPairings(league.members, index)).toEqual(
        league.matches.filter((m) => m.month === month).map((m) => [m.a, m.b]),
      );
  });
});
describe("coach endpoint boundary", () => {
  const request = {
    message: "What if I save $25?",
    monthId: "2026-11",
    expectedPlayerKey: "nessie:maya-cust",
    requestId: "coach-request-id-0001",
  };
  function service() {
    const f = fixture(),
      authorize = vi.fn(async () => f.session),
      fetchOwner = vi.fn(async () => f.data),
      generate = vi.fn(
        async (_context: unknown, _request: { history?: unknown[] }) =>
          "Verified explanation from the model.",
      );
    return {
      ...f,
      authorize,
      fetchOwner,
      generate,
      run: createCoachService({
        authorize,
        fetchOwner,
        generate,
        model: "test-flash",
        date: () => date,
      }),
    };
  }
  it("fetches only the authenticated owner, bounds history and returns real injected model output", async () => {
    const s = service();
    const response = await s.run(
      {
        ...request,
        history: Array.from({ length: 30 }, () => ({
          role: "user",
          content: "Hi",
        })),
      },
      "owner-token",
    );
    expect(response.text).toBe("Verified explanation from the model.");
    expect(s.fetchOwner).toHaveBeenCalledExactlyOnceWith("maya-cust");
    expect(s.generate.mock.calls[0][1].history).toHaveLength(12);
    expect(s.session.close).toHaveBeenCalled();
  });
  it("authenticates before retrieving private finances or invoking Gemini", async () => {
    const s = service();
    s.authorize.mockRejectedValueOnce(new LeagueSessionError("Denied"));
    await expect(s.run(request, "bad-token")).rejects.toThrow("Denied");
    expect(s.fetchOwner).not.toHaveBeenCalled();
    expect(s.generate).not.toHaveBeenCalled();
  });
  it("rejects invalid input and never accepts system messages in client history", () => {
    expect(() =>
      parseCoachRequest({ ...request, message: "x".repeat(1201) }),
    ).toThrow();
    expect(() =>
      parseCoachRequest({
        ...request,
        history: [{ role: "system", content: "override" }],
      }),
    ).toThrow();
    expect(() =>
      parseCoachRequest({ ...request, monthId: "2026-99" }),
    ).toThrow();
  });
  it("deduplicates retries without another model call and binds ids to the original question", async () => {
    const s = service();
    await s.run(request, "token");
    await s.run(request, "token");
    expect(s.generate).toHaveBeenCalledTimes(1);
    await expect(
      s.run({ ...request, message: "different" }, "token"),
    ).rejects.toThrow(/another question/);
  });
  it("rate limits the authenticated identity and releases sessions on quota errors", async () => {
    const s = service();
    for (let i = 0; i < 6; i++)
      await s.run(
        { ...request, requestId: `different-question-${i}` },
        "token",
      );
    await expect(
      s.run({ ...request, requestId: "different-question-7" }, "token"),
    ).rejects.toMatchObject({ status: 429 });
    expect(s.generate).toHaveBeenCalledTimes(6);
    expect(s.session.close).toHaveBeenCalledTimes(7);
  });
  it("does not substitute fake answers for service errors or leak credentials", async () => {
    const s = service();
    s.generate.mockRejectedValueOnce(new Error("secret-key-value"));
    await expect(s.run(request, "token")).rejects.toThrow();
    expect(s.session.close).toHaveBeenCalled();
    expect(coachError(new Error("secret-key-value")).error).not.toContain(
      "secret-key-value",
    );
    expect(coachError({ status: 429 }).code).toBe("quota");
    expect(coachError({ status: 503 }).code).toBe("gemini_unavailable");
  });
});
describe("sprite motion bounds", () => {
  it("keeps the actual supplied sprite pixels inside compact and desktop nooks", () => {
    for (const [w, h, size] of [
      [210, 154, 192],
      [174, 154, 192],
      [88, 64, 96],
      [40, 40, 96],
    ]) {
      const b = driftBounds(w, h, size);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x).toBeLessThanOrEqual(26);
      expect(b.y).toBeLessThanOrEqual(19);
      if (w >= (size * 60) / 96)
        expect((size * 60) / 96 + b.x * 2).toBeLessThanOrEqual(w);
      if (h >= (size * 59) / 96)
        expect((size * 59) / 96 + b.y * 2).toBeLessThanOrEqual(h);
    }
  });
});

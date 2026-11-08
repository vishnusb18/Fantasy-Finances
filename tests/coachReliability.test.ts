import { describe, it, expect, vi } from "vitest";
import type { GoogleGenAI } from "@google/genai";
import { buildMatchupContext } from "../server/coach/buildMatchupContext";
import {
  generateCoachReply,
  createCoachService,
  coachError,
} from "../server/coach/coachRoutes";
import {
  explanationCatalog,
  renderVerifiedExplanation,
} from "../server/coach/verifiedExplanation";
import { validateScenario, scoreDelta } from "../server/coach/scenarios";
import { boundedCoachHistory } from "../src/lib/coach";
import { formatEfficiency } from "../src/lib/finance/util";
import { generatePersonaBundle } from "../src/lib/finance/demo/personas";
import { MEMBERS } from "../src/lib/competition/demo";
import { nessieToProviderData } from "../src/lib/finance/adapters/nessie/toProviderData";
import { runFinancePipeline } from "../src/lib/finance/pipeline";
import { simulateMove } from "../src/lib/competition/moves";
import type { LeagueSession } from "../server/leagueSession";

const date = "2026-11-08",
  question = "What if I save another $25?";
function fixture(maxed = false) {
  let data = nessieToProviderData(
    generatePersonaBundle(MEMBERS[0], date),
    "nessie",
  );
  const result = runFinancePipeline({ data, asOf: date });
  if (maxed) {
    data = simulateMove(
      { data, asOf: date, lockedBaseline: result.baseline },
      { kind: "save", amountCents: result.baseline.savings.targetCents },
    ).data;
    const expense = data.transactions.find((t) => t.kind === "expense")!;
    data = {
      ...data,
      transactions: [
        ...data.transactions,
        {
          ...expense,
          id: "test-overspend",
          sourceTransactionId: "test-overspend",
          occurredAt: date,
          category: "shopping",
          amountCents: -8000,
          pending: false,
        },
      ],
    };
  }
  const session: LeagueSession = {
    identity: "test-owner",
    playerKey: data.playerId,
    displayName: "Maya Chen",
    baseline: result.baseline,
    confirmations: {},
    overrides: [],
    players: [],
    scores: [],
    controls: () => true,
    close: vi.fn(),
    connection: {} as LeagueSession["connection"],
  };
  const context = buildMatchupContext(session, data, "2026-11", date, question);
  return {
    data,
    session,
    context,
    scenario: context.scenarios.find((s) => s.id === "save:2500")!,
  };
}
function sdk(text: string, finishReason: string | undefined = "STOP") {
  const generateContent = vi.fn(async () => ({
    text,
    candidates: [{ finishReason }],
    usageMetadata: {
      promptTokenCount: 100,
      candidatesTokenCount: 40,
      thoughtsTokenCount: 12,
      totalTokenCount: 152,
    },
  }));
  return {
    ai: { models: { generateContent } } as unknown as GoogleGenAI,
    generateContent,
  };
}
const plan = JSON.stringify({ explanationIds: [], recommendationIds: [] });
/** A verified statement Gemini may quote (its numbers come from the engine). */
const verifiedForecast = (context: ReturnType<typeof fixture>["context"]) =>
  explanationCatalog(context).facts.find((f) => f.id === "scenario.forecast")!.text;

describe("engine-only paired scenario ledger", () => {
  it("saving $25 at 25/25 yields no current or forecast gain, despite a different baseline forecast", () => {
    const { scenario: s, context } = fixture(true);
    expect(s.category.beforePoints).toBe(25);
    expect(s.category.availablePoints).toBe(25);
    expect(s.category.remainingCapacityPoints).toBe(0);
    expect(s.category.remainingTargetCents).toBe(0);
    expect(s.feasible).toBe(true);
    expect(s.hypotheticalCurrent).toEqual(s.current);
    expect(s.hypotheticalForecast).toEqual(s.baselineForecast);
    expect(s.rawEarnedPointDelta).toBe(0);
    expect(s.percentagePointDelta).toBe(0);
    expect(s.projectedRawPointDelta).toBe(0);
    expect(s.projectedPercentagePointDelta).toBe(0);
    expect(s.current.efficiencyPercent).not.toBe(
      s.baselineForecast!.efficiencyPercent,
    );
    const answer = renderVerifiedExplanation(
      JSON.parse(plan),
      explanationCatalog(context),
    );
    expect(answer).toContain("adds no points");
    expect(answer).toContain("Already maxed out");
    expect(answer).toContain(
      `baseline ${formatEfficiency(s.baselineForecast!.efficiencyPercent)} → hypothetical ${formatEfficiency(s.baselineForecast!.efficiencyPercent)}`,
    );
    expect(answer).not.toMatch(/would (raise|lower)/);
  });
  it("partially funded savings reports engine current/current and forecast/forecast values separately", () => {
    const { data, session, scenario: s, context } = fixture();
    const p = simulateMove(
      { data, asOf: date, lockedBaseline: session.baseline! },
      { kind: "save", amountCents: 2500 },
    );
    expect(s.current.efficiencyPercent).toBe(p.before.score.efficiencyPct);
    expect(s.hypotheticalCurrent!.efficiencyPercent).toBe(
      p.after.score.efficiencyPct,
    );
    expect(s.baselineForecast!.efficiencyPercent).toBe(
      p.projectedBefore!.efficiencyPct,
    );
    expect(s.hypotheticalForecast!.efficiencyPercent).toBe(
      p.projectedAfter!.efficiencyPct,
    );
    expect(s.projectedPercentagePointDelta).toBe(
      scoreDelta(
        p.projectedBefore!.efficiencyPct,
        p.projectedAfter!.efficiencyPct,
      ),
    );
    expect(s.percentagePointDelta).toBeGreaterThan(0);
    expect(s.amountCents).toBe(2500);
    expect(s.baselineForecast).toEqual(context.baselineForecast);
  });
  it("does not invent hypothetical gains for ineligible investing or reserve violations", () => {
    const { data, session, context } = fixture();
    const invest = context.scenarios.find((s) => s.id === "invest:2500")!;
    expect(invest.category.eligible).toBe(false);
    expect(invest.feasible).toBe(false);
    expect(invest.hypotheticalCurrent).toBeNull();
    expect(invest.percentagePointDelta).toBeNull();
    const lowCash = {
      ...data,
      accounts: data.accounts.map((a) =>
        a.type === "checking" ? { ...a, balanceCents: 11000 } : a,
      ),
    };
    const unsafe = buildMatchupContext(
      session,
      lowCash,
      "2026-11",
      date,
      question,
    ).scenarios.find((s) => s.id === "save:2500")!;
    expect(unsafe.feasible).toBe(false);
    expect(unsafe.reason).toMatch(/reserve|safe cash/);
    expect(unsafe.hypotheticalForecast).toBeNull();
  });
  it("validates paired metric labels, deltas, category caps and integer cents", () => {
    const s = fixture().scenario;
    expect(() => validateScenario({ ...s, amountCents: 2500.5 })).toThrow(
      /money/,
    );
    expect(() => validateScenario({ ...s, percentagePointDelta: 99 })).toThrow(
      /comparisons/,
    );
    expect(() =>
      validateScenario({ ...s, projectedPercentagePointDelta: 99 }),
    ).toThrow(/comparisons/);
    expect(() =>
      validateScenario({ ...s, category: { ...s.category, afterPoints: 999 } }),
    ).toThrow(/category/);
  });
  it("never accepts financial prose, arbitrary numbers, metric relabeling or unknown fact IDs from Gemini", () => {
    const catalog = explanationCatalog(fixture(true).context);
    for (const invalid of [
      {
        explanationIds: [],
        recommendationIds: [],
        text: "Your projected efficiency improves to 56.3%.",
      },
      { explanationIds: ["current:56.3"], recommendationIds: [] },
      {
        explanationIds: ["Savings will raise your efficiency"],
        recommendationIds: [],
      },
      { explanationIds: [], recommendationIds: ["scenario.answer"] },
    ])
      expect(() => renderVerifiedExplanation(invalid, catalog)).toThrow(
        /Unverified/,
      );
  });
});

describe("Gemini completion and telemetry", () => {
  it("selects opponent strengths by normalized public fractions rather than unequal raw point weights", () => {
    const context = fixture().context;
    context.opponent = {
      teamName: "Public opponent",
      efficiencyPercent: 60,
      earnedPoints: 12,
      eligiblePoints: 20,
      categories: [
        {
          key: "dining_out",
          name: "Dining out",
          earnedPoints: 2,
          maxEligiblePoints: 2,
          eligible: true,
          efficiencyPercent: 100,
        },
        {
          key: "shopping",
          name: "Shopping",
          earnedPoints: 10,
          maxEligiblePoints: 20,
          eligible: true,
          efficiencyPercent: 50,
        },
      ],
    };
    const catalog = explanationCatalog(context);
    expect(
      catalog.facts.find((f) => f.id === "opponent.strongest")!.text,
    ).toMatch(/Dining out: 100.0%/);
    expect(
      catalog.facts.find((f) => f.id === "opponent.weakest")!.text,
    ).toMatch(/Shopping: 50.0%/);
  });
  it("accepts Gemini's own wording when every number is verified, with safe metadata", async () => {
    const context = fixture().context;
    const reply = `Short answer: it helps. ${verifiedForecast(context)}`;
    const { ai, generateContent } = sdk(reply),
      log = vi.fn();
    const answer = await generateCoachReply(
      ai,
      "gemini-3.5-flash",
      context,
      { message: question, monthId: "2026-11" },
      log,
    );
    expect(answer).toBe(reply);
    expect(generateContent).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith({
      model: "gemini-3.5-flash",
      completionStatus: "STOP",
      responseLength: reply.length,
      promptTokens: 100,
      outputTokens: 40,
      thinkingTokens: 12,
      totalTokens: 152,
      verification: "verified",
    });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(
      /transactions|apiKey|account|Maya/,
    );
  });
  it("never shows an invented number: retries once with feedback, then falls back to the verified template", async () => {
    const context = fixture().context;
    const { ai, generateContent } = sdk(
      "Save $999.99 and you'll gain 42.7 points, guaranteed.",
    );
    const log = vi.fn();
    const answer = await generateCoachReply(
      ai,
      "test",
      context,
      { message: question, monthId: "2026-11" },
      log,
    );
    expect(generateContent).toHaveBeenCalledTimes(2);
    const retry = generateContent.mock.calls[1] as unknown as [
      { contents: { parts: { text: string }[] }[] },
    ];
    expect(retry[0].contents.at(-1)!.parts[0].text).toMatch(/\$999\.99.*42\.7/);
    expect(answer).not.toMatch(/999|42\.7/);
    expect(answer).toContain("Month-end forecast: baseline"); // verified template
    expect(log.mock.calls.at(-1)![0]).toMatchObject({
      verification: "template_fallback",
      rejectedNumbers: 2,
    });
  });
  it("uses the retry when Gemini fixes its numbers after feedback", async () => {
    const context = fixture().context;
    const fixed = `Here's the verified picture. ${verifiedForecast(context)}`;
    const { ai, generateContent } = sdk("You'd gain 42.7 points.");
    generateContent.mockResolvedValueOnce({
      text: "You'd gain 42.7 points.",
      candidates: [{ finishReason: "STOP" }],
    } as never);
    generateContent.mockResolvedValueOnce({
      text: fixed,
      candidates: [{ finishReason: "STOP" }],
    } as never);
    const log = vi.fn();
    expect(
      await generateCoachReply(ai, "test", context, { message: question, monthId: "2026-11" }, log),
    ).toBe(fixed);
    expect(log.mock.calls.at(-1)![0].verification).toBe("retried");
  });
  it.each(["MAX_TOKENS", "SAFETY", undefined])(
    "rejects %s even if its text looks like valid complete JSON",
    async (finish) => {
      const { ai } = sdk(plan);
      (
        ai.models.generateContent as unknown as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        text: plan,
        candidates: [{ finishReason: finish }],
      });
      await expect(
        generateCoachReply(
          ai,
          "test",
          fixture().context,
          { message: question, monthId: "2026-11" },
          vi.fn(),
        ),
      ).rejects.toMatchObject({ code: "incomplete_response" });
    },
  );
  it.each(["", "   \n  "])(
    "rejects an empty answer, never a partial success",
    async (text) => {
      const { ai } = sdk(text);
      await expect(
        generateCoachReply(
          ai,
          "test",
          fixture().context,
          { message: question, monthId: "2026-11" },
          vi.fn(),
        ),
      ).rejects.toMatchObject({ status: 502, code: "empty_response" });
    },
  );
  it("logs sanitized failures without raw SDK errors or credentials", async () => {
    const { ai, generateContent } = sdk(plan),
      log = vi.fn();
    generateContent.mockRejectedValueOnce(
      Object.assign(new Error("APIKEY_SECRET private transaction"), {
        status: 429,
      }),
    );
    await expect(
      generateCoachReply(
        ai,
        "test",
        fixture().context,
        { message: question, monthId: "2026-11" },
        log,
      ),
    ).rejects.toThrow();
    expect(JSON.stringify(log.mock.calls)).not.toMatch(
      /APIKEY_SECRET|private transaction/,
    );
    expect(log.mock.calls[0][0].errorCode).toBe("quota");
    expect(coachError({ name: "TimeoutError" }).code).toBe(
      "interrupted_request",
    );
  });
});

describe("complete response transport and retries", () => {
  const request = {
    message: question,
    monthId: "2026-11",
    requestId: "reliability-question-0001",
  };
  it("does not cache an interrupted Gemini result and retries the identical request successfully", async () => {
    const { data, session, context } = fixture();
    const incomplete = sdk(plan, "MAX_TOKENS");
    const complete = sdk(verifiedForecast(context), "STOP");
    const generate = vi
      .fn()
      .mockImplementationOnce((context, question) =>
        generateCoachReply(incomplete.ai, "test", context, question, vi.fn()),
      )
      .mockImplementationOnce((context, question) =>
        generateCoachReply(complete.ai, "test", context, question, vi.fn()),
      );
    const run = createCoachService({
      authorize: async () => session,
      fetchOwner: async () => data,
      generate,
      model: "test",
      date: () => date,
    });
    await expect(run(request, "token")).rejects.toMatchObject({
      code: "incomplete_response",
    });
    const answer = await run(request, "token");
    expect(answer.completion).toBe("complete");
    expect(answer.text).toContain("Month-end forecast: baseline");
    expect(await run(request, "token")).toEqual(answer);
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it("does not silently slice complete answers at 5000 characters", async () => {
    const { data, session } = fixture();
    const text = "Verified complete message. ".repeat(260) + "END OF ANSWER";
    const run = createCoachService({
      authorize: async () => session,
      fetchOwner: async () => data,
      generate: async () => text,
      model: "test",
      date: () => date,
    });
    const response = await run(request, "token");
    expect(response.completion).toBe("complete");
    expect(response.text).toBe(text);
    expect(response.text.endsWith("END OF ANSWER")).toBe(true);
  });
  it("retries failed generations, caches only verified completed answers, and prevents rapid overlapping questions", async () => {
    const { data, session } = fixture();
    let release!: (text: string) => void;
    const generate = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );
    const run = createCoachService({
      authorize: async () => session,
      fetchOwner: async () => data,
      generate,
      model: "test",
      date: () => date,
    });
    const first = run(request, "token");
    await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce());
    await expect(
      run({ ...request, requestId: "reliability-question-0002" }, "token"),
    ).rejects.toMatchObject({ code: "busy" });
    release("Complete answer.");
    expect((await first).completion).toBe("complete");
    await run(request, "token");
    expect(generate).toHaveBeenCalledOnce();
  });
  it("bounds history by whole messages instead of cutting explanations mid-sentence", () => {
    const content = "Long complete answer. ".repeat(280) + "END";
    expect(
      boundedCoachHistory([{ role: "assistant", content }])[0].content,
    ).toBe(content);
    expect(
      boundedCoachHistory([
        { role: "assistant", content: "x".repeat(15000) },
        { role: "user", content: "Next question" },
      ]),
    ).toEqual([{ role: "user", content: "Next question" }]);
  });
});

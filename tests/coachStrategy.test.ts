import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { buildMatchupContext } from "../server/coach/buildMatchupContext";
import {
  buildMatchupAnalysis,
  type AnalysisCategory,
} from "../server/coach/matchupAnalysis";
import {
  explanationCatalog,
  renderVerifiedExplanation,
} from "../server/coach/verifiedExplanation";
import {
  generateCoachReply,
  COACH_SYSTEM_MESSAGE,
} from "../server/coach/coachRoutes";
import type { GoogleGenAI } from "@google/genai";
import { generatePersonaBundle } from "../src/lib/finance/demo/personas";
import { nessieToProviderData } from "../src/lib/finance/adapters/nessie/toProviderData";
import { MEMBERS } from "../src/lib/competition/demo";
import { runFinancePipeline } from "../src/lib/finance/pipeline";
import { simulateMove } from "../src/lib/competition/moves";
import { publicScoreArgs } from "../src/lib/league/publish";
import type { LeagueSession, PublicLeagueScore } from "../server/leagueSession";

const date = "2026-11-08",
  question = "How can I beat my opponent this month?";
const published = JSON.parse(
  readFileSync(
    new URL("./fixtures/coach-public-nov2026.json", import.meta.url),
    "utf8",
  ),
) as {
  players: {
    name: string;
    earnedPoints: number;
    availablePoints: number;
    efficiencyPct: number;
    categories: PublicLeagueScore["categories"];
  }[];
};
const plan = {
  explanationIds: ["strategy.gaps.direct", "strategy.strengths.direct"],
  recommendationIds: ["strategy.action.best"],
};
function fixture(key = "maya", locked = true) {
  const persona = MEMBERS.find((m) => m.key === key)!;
  const data = nessieToProviderData(
    generatePersonaBundle(persona, date),
    "nessie",
  );
  const result = runFinancePipeline({ data, asOf: date });
  const session: LeagueSession = {
    identity: "strategy-test",
    playerKey: data.playerId,
    displayName: data.displayName,
    baseline: locked ? result.baseline : undefined,
    confirmations: {},
    overrides: [],
    connection: {} as LeagueSession["connection"],
    controls: () => true,
    close: vi.fn(),
    players: MEMBERS.map((m) => ({
      playerKey: `nessie:${m.key}-cust`,
      displayName: `${m.firstName} ${m.lastName}`,
      source: "nessie",
    })),
    scores: published.players.map((p) => ({
      playerKey: `nessie:${p.name === "Maya Chen" ? "maya" : "alex"}-cust`,
      month: "2026-11",
      status: "provisional",
      efficiencyPct: p.efficiencyPct,
      earnedPoints: p.earnedPoints,
      availablePoints: p.availablePoints,
      categories: p.categories,
      updatedAt: "1",
    })),
  };
  return {
    data,
    session,
    context: buildMatchupContext(session, data, "2026-11", date, question),
  };
}
const cat = (
  key: string,
  earnedPoints: number,
  maxEligiblePoints: number,
  eligible = true,
): AnalysisCategory => ({
  key,
  name: key,
  earnedPoints,
  maxEligiblePoints,
  eligible,
});
const analyze = (owner: AnalysisCategory[], opponent: AnalysisCategory[]) =>
  buildMatchupAnalysis({
    user: { categories: owner },
    opponent: { teamName: "Opponent", categories: opponent },
    scenarios: [],
    active: true,
    baselineVerified: false,
    ownerScoresFromEngine: true,
  });

describe("verified matchup gaps and category availability", () => {
  it("reproduces the current published Maya/Alex matchup without calling 100% weak", () => {
    const { context } = fixture("alex", false),
      a = context.analysis;
    expect(a.opponentName).toBe("Maya Chen");
    expect(a.opponentAllPublishedPositionsMaxed).toBe(true);
    expect(a.opponentWeaknesses).toEqual([]);
    expect(a.categoryGaps.map((g) => g.key)).toEqual([
      "dining_out",
      "shopping",
      "subscriptions",
      "entertainment",
    ]);
    expect(a.categoryGaps[0].performanceGapPoints).toBe(11.7);
    const answer = renderVerifiedExplanation(plan, explanationCatalog(context));
    expect(answer).not.toMatch(
      /weakest.*100|unpublished positions|private finances|outcomes are provisional/i,
    );
    expect(answer).toContain("Maya is maxed");
    expect(answer.split(/\s+/).length).toBeLessThanOrEqual(110);
  });
  it("treats actual scored zeros differently from 0/0 ineligibility and absent positions", () => {
    const a = fixture("alex", false).context.analysis;
    const dining = a.categories.find((c) => c.key === "dining_out")!;
    expect(dining.user).toMatchObject({
      state: "scored",
      trueZero: true,
      earnedPoints: 0,
      maxEligiblePoints: 11.7,
    });
    expect(a.categories.find((c) => c.key === "nightlife")!.user).toMatchObject(
      { state: "ineligible", trueZero: false, fraction: null },
    );
    expect(
      a.categories.find((c) => c.key === "savings")!.opponent,
    ).toMatchObject({
      state: "unpublished",
      earnedPoints: null,
      fraction: null,
      trueZero: false,
    });
    expect(a.categoryGaps).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "savings" })]),
    );
  });
  it("ranks earned/max point deficits by the user's point weight, never by percentages alone", () => {
    const a = analyze(
      [cat("dining_out", 0, 2), cat("shopping", 0, 20), cat("savings", 10, 10)],
      [
        cat("dining_out", 2, 2),
        cat("shopping", 20, 20),
        cat("savings", 25, 25),
      ],
    );
    expect(a.categoryGaps.map((g) => [g.key, g.performanceGapPoints])).toEqual([
      ["shopping", 20],
      ["dining_out", 2],
    ]);
    expect(a.categoryGaps.some((g) => g.key === "savings")).toBe(false);
  });
  it("excludes missing, invalid, ineligible and unscored records rather than padding them with zeros", () => {
    const a = analyze(
      [
        cat("shopping", 0, 0),
        cat("dining_out", NaN, 10),
        cat("investing", 0, 10, false),
      ],
      [
        cat("shopping", 10, 10),
        cat("dining_out", 8, 10),
        cat("investing", 9, 10),
      ],
    );
    expect(a.categoryGaps).toEqual([]);
    expect(a.categories.find((c) => c.key === "shopping")!.user.state).toBe(
      "unscored",
    );
    expect(a.categories.find((c) => c.key === "dining_out")!.user.state).toBe(
      "invalid",
    );
    expect(a.categories.find((c) => c.key === "bills")!.user.state).toBe(
      "missing",
    );
  });
  it("does not label a position displayed as 100% weak because of a tiny rounding remainder", () => {
    const a = analyze(
      [cat("shopping", 9.999, 10)],
      [cat("shopping", 9.999, 10)],
    );
    expect(a.opponentWeaknesses).toEqual([]);
    expect(a.categoryGaps).toEqual([]);
  });
  it("does not invent a deficit or an opponent edge when Maya already leads every comparable position", () => {
    const { context } = fixture();
    expect(context.analysis.categoryGaps).toEqual([]);
    const text = renderVerifiedExplanation(plan, explanationCatalog(context));
    expect(text).toContain("You're not behind");
    expect(text).toContain("Alex has no verified category edge");
    expect(text).not.toMatch(/Current.*efficiency|70.6|88.2%/);
    expect(text.split(/\s+/).length).toBeGreaterThanOrEqual(70);
    expect(text.split(/\s+/).length).toBeLessThanOrEqual(110);
  });
});

describe("recoverable points and one realistic next move", () => {
  it("ends with Maya's strongest simulator-checked contribution and actual point gain", () => {
    const { data, session, context } = fixture(),
      action = context.analysis.bestNextAction!;
    expect(action).toMatchObject({
      action: "save",
      amountCents: 4500,
      rawPointGain: 9.4,
      completesTarget: true,
    });
    const p = simulateMove(
      { data, asOf: date, lockedBaseline: session.baseline! },
      { kind: "save", amountCents: action.amountCents },
    );
    expect(action.rawPointGain).toBe(p.rawPointDelta);
    expect(
      renderVerifiedExplanation(plan, explanationCatalog(context)),
    ).toMatch(
      /Completing your remaining eligible savings target with \$45 would earn another 9.4 points\.$/,
    );
  });
  it("does not recommend recovering overspending losses without a verified recovery scenario", () => {
    const { data, session } = fixture();
    const expense = data.transactions.find((t) => t.kind === "expense")!;
    const changed = {
      ...data,
      transactions: [
        ...data.transactions,
        {
          ...expense,
          id: "overspend-test",
          occurredAt: date,
          amountCents: -8000,
          category: "shopping" as const,
          pending: false,
        },
      ],
    };
    const context = buildMatchupContext(
        session,
        changed,
        "2026-11",
        date,
        question,
      ),
      shop = context.analysis.categories.find((c) => c.key === "shopping")!;
    expect(shop.lostPoints).toBeGreaterThan(0);
    expect(shop.recoverablePoints).toBe(0);
    expect(
      context.analysis.feasibleNextActions.some(
        (a) => a.categoryKey === "shopping",
      ),
    ).toBe(false);
    expect(context.analysis.bestNextAction?.categoryKey).toBe("savings");
  });
  it("uses only the affordable part of a target after bills and reserve", () => {
    const { data, session, context: original } = fixture();
    const changed = {
      ...data,
      accounts: data.accounts.map((a) =>
        a.type === "checking"
          ? {
              ...a,
              balanceCents:
                a.balanceCents -
                original.user.safeAvailableToAllocateCents! +
                2500,
            }
          : a,
      ),
    };
    const context = buildMatchupContext(
        session,
        changed,
        "2026-11",
        date,
        question,
      ),
      action = context.analysis.bestNextAction!;
    expect(context.user.safeAvailableToAllocateCents).toBe(2500);
    expect(action).toMatchObject({
      amountCents: 2500,
      rawPointGain: 5.2,
      completesTarget: false,
    });
    expect(
      renderVerifiedExplanation(plan, explanationCatalog(context)),
    ).toMatch(/Contributing \$25 to savings would earn another 5.2 points\.$/);
  });
  it("does not recommend moving money when a bill status is unknown", () => {
    const { data, session } = fixture();
    const changed = {
      ...data,
      obligations: [
        ...data.obligations,
        {
          ...data.obligations[0],
          id: "unknown-bill",
          status: "unknown" as const,
          dueDate: date,
        },
      ],
    };
    const context = buildMatchupContext(
      session,
      changed,
      "2026-11",
      date,
      question,
    );
    expect(context.analysis.bestNextAction).toBeNull();
    expect(context.analysis.nextActionState).toBe("financial_info_missing");
    expect(
      renderVerifiedExplanation(plan, explanationCatalog(context)),
    ).not.toMatch(/would earn another/);
  });
  it("can recommend a simulator-verified newly due bill without counting its previously unscored position as zero", () => {
    const { data, session } = fixture();
    const changed = {
      ...data,
      obligations: [
        {
          ...data.obligations[0],
          id: "due-today",
          status: "due" as const,
          dueDate: date,
          amountCents: 5000,
        },
      ],
    };
    const context = buildMatchupContext(
      session,
      changed,
      "2026-11",
      date,
      question,
    );
    expect(
      context.analysis.categories.find((c) => c.key === "bills")!.user.state,
    ).toBe("unscored");
    expect(context.analysis.bestNextAction).toMatchObject({
      action: "pay_due_bill",
      rawPointGain: 20,
    });
    expect(context.analysis.categoryGaps.some((g) => g.key === "bills")).toBe(
      false,
    );
  });
});

describe("concise grounded strategy rendering", () => {
  it("redirects unrelated requests briefly without attaching financial claims", () => {
    const f = fixture();
    for (const context of [
      f.context,
      buildMatchupContext(
        f.session,
        f.data,
        "2026-11",
        date,
        "What if I save $25?",
      ),
    ]) {
      const catalog = explanationCatalog(context);
      const answer = renderVerifiedExplanation(
        { explanationIds: ["coach.redirect"], recommendationIds: [] },
        catalog,
      );
      expect(answer).toContain("financial performance and matchup strategy");
      expect(answer.split(/\s+/).length).toBeLessThan(30);
      expect(answer).not.toMatch(/\d|Current|Maya|Alex/);
      expect(() =>
        renderVerifiedExplanation(
          {
            explanationIds: [
              "coach.redirect",
              catalog.facts.find(
                (f) => f.id !== "coach.redirect" && f.kind === "explanation",
              )!.id,
            ],
            recommendationIds: [],
          },
          catalog,
        ),
      ).toThrow(/Redirect/);
    }
  });
  it("keeps complete real fixture matchups within 70–110 words, including investing and due-bill opportunities", () => {
    const scores = MEMBERS.map((m) => {
      const data = nessieToProviderData(
        generatePersonaBundle(m, date),
        "nessie",
      );
      const args = publicScoreArgs(
        runFinancePipeline({ data, asOf: date }).score,
      );
      return {
        ...args,
        efficiencyPct: args.efficiencyPct ?? null,
        updatedAt: "1",
      };
    });
    for (const m of MEMBERS) {
      const { data, session } = fixture(m.key);
      session.scores = scores;
      const catalog = explanationCatalog(
        buildMatchupContext(session, data, "2026-11", date, question),
      );
      for (const gapId of [
        "strategy.gaps.direct",
        "strategy.gaps.competitive",
      ]) {
        const answer = renderVerifiedExplanation(
          { ...plan, explanationIds: [gapId, "strategy.strengths.direct"] },
          catalog,
        );
        expect(answer.split(/\s+/).length).toBeGreaterThanOrEqual(70);
        expect(answer.split(/\s+/).length).toBeLessThanOrEqual(110);
      }
    }
  });
  it("requires the three sections in order with exactly one verified best-action ending", () => {
    const catalog = explanationCatalog(fixture().context);
    const answer = renderVerifiedExplanation(
      {
        explanationIds: [
          "strategy.strengths.direct",
          "strategy.gaps.competitive",
        ],
        recommendationIds: ["strategy.action.best"],
      },
      catalog,
    );
    expect(answer.split("\n\n")).toHaveLength(3);
    expect(answer).toMatch(/^You're holding your own/);
    for (const invalid of [
      { explanationIds: [], recommendationIds: [] },
      {
        explanationIds: ["strategy.gaps.direct", "strategy.gaps.competitive"],
        recommendationIds: ["strategy.action.best"],
      },
      { ...plan, recommendationIds: ["invented.action"] },
      { ...plan, text: "Invest $999 for 50 points" },
    ])
      expect(() => renderVerifiedExplanation(invalid, catalog)).toThrow();
  });
  it("keeps ordinary responses within the word budget across all six financial fixtures", () => {
    for (const member of MEMBERS) {
      const f = fixture(member.key);
      for (const id of ["strategy.gaps.direct", "strategy.gaps.competitive"]) {
        const text = renderVerifiedExplanation(
          { ...plan, explanationIds: [id, "strategy.strengths.direct"] },
          explanationCatalog(f.context),
        );
        expect(text.split(/\s+/).length).toBeLessThanOrEqual(110);
      }
    }
  });
  it("sends the verified analysis and facts to Gemini and returns its own wording when every number checks out", async () => {
    const context = fixture().context;
    const best = explanationCatalog(context).facts.find(
      (f) => f.id === "strategy.action.best",
    )!.text;
    expect(best).toMatch(/9.4 points\.$/);
    const reply = `You're ahead where it counts against Alex, so protect those leads. ${best}`;
    const generateContent = vi.fn(async (_request: unknown) => ({
      text: reply,
      candidates: [{ finishReason: "STOP" }],
    }));
    const text = await generateCoachReply(
      { models: { generateContent } } as unknown as GoogleGenAI,
      "test-flash",
      context,
      { message: question, monthId: "2026-11" },
      vi.fn(),
    );
    const request = generateContent.mock.calls[0][0] as {
      config: { systemInstruction: string; responseJsonSchema?: unknown };
    };
    expect(
      request.config.systemInstruction.startsWith(`${COACH_SYSTEM_MESSAGE}\n`),
    ).toBe(true);
    expect(COACH_SYSTEM_MESSAGE).toContain(
      "For unrelated requests, respond briefly and naturally redirect to your expertise.",
    );
    expect(request.config.systemInstruction).toContain('"categoryGaps"');
    expect(request.config.systemInstruction).toContain('"feasibleNextActions"');
    expect(request.config.systemInstruction).toContain(best);
    expect(request.config.responseJsonSchema).toBeUndefined();
    expect(text).toBe(reply);
    expect(generateContent).toHaveBeenCalledOnce();
  });
});

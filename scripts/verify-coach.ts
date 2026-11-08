/** Real Gemini request with a deterministic self-test fixture; never touches the live league. */
import { readFileSync } from "node:fs";
import { loadEnv } from "vite";
import { GoogleGenAI } from "@google/genai";
import {
  generateCoachReply,
  DEFAULT_COACH_MODEL,
  coachError,
} from "../server/coach/coachRoutes";
import { buildMatchupContext } from "../server/coach/buildMatchupContext";
import { generatePersonaBundle } from "../src/lib/finance/demo/personas";
import { MEMBERS } from "../src/lib/competition/demo";
import { nessieToProviderData } from "../src/lib/finance/adapters/nessie/toProviderData";
import { simulateMove } from "../src/lib/competition/moves";
import { runFinancePipeline } from "../src/lib/finance/pipeline";
import type { LeagueSession } from "../server/leagueSession";
const env = loadEnv("development", process.cwd(), "");
const model = env.GEMINI_MODEL || DEFAULT_COACH_MODEL;
if (!env.GEMINI_API_KEY) {
  console.log(JSON.stringify({ status: "missing_key", model }));
  process.exitCode = 1;
} else {
  const now = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const strategy = process.argv.includes("--strategy");
  const againstMaya = process.argv.includes("--against-maya");
  const message = strategy
    ? "How can I beat my opponent this month?"
    : "What if I save another $25? Explain the verified scenario concisely.";
  const persona = MEMBERS.find(
    (m) => m.key === (againstMaya ? "alex" : "maya"),
  )!;
  let data = nessieToProviderData(
    generatePersonaBundle(persona, now),
    "nessie",
  );
  let result = runFinancePipeline({ data, asOf: now });
  if (process.argv.includes("--maxed")) {
    const preview = simulateMove(
      { data, asOf: now, lockedBaseline: result.baseline },
      { kind: "save", amountCents: result.baseline.savings.targetCents },
    );
    data = preview.data;
    result = preview.after;
  }
  const session = {
    identity: "self-test-fixture",
    playerKey: data.playerId,
    displayName: data.displayName,
    baseline: againstMaya ? undefined : result.baseline,
    confirmations: {},
    overrides: [],
    players: strategy
      ? MEMBERS.map((m) => ({
          playerKey: `nessie:${m.key}-cust`,
          displayName: `${m.firstName} ${m.lastName}`,
          source: "nessie",
        }))
      : [],
    scores: strategy
      ? (
          JSON.parse(
            readFileSync(
              new URL(
                "../tests/fixtures/coach-public-nov2026.json",
                import.meta.url,
              ),
              "utf8",
            ),
          ) as {
            players: Array<{
              name: string;
              efficiencyPct: number;
              earnedPoints: number;
              availablePoints: number;
              categories: LeagueSession["scores"][number]["categories"];
            }>;
          }
        ).players.map((p) => ({
          playerKey: `nessie:${p.name === "Maya Chen" ? "maya" : "alex"}-cust`,
          month: "2026-11",
          status: "provisional",
          efficiencyPct: p.efficiencyPct,
          earnedPoints: p.earnedPoints,
          availablePoints: p.availablePoints,
          categories: p.categories,
          updatedAt: "1",
        }))
      : [],
    controls: () => true,
    close: () => {},
    connection: {} as LeagueSession["connection"],
  };
  const context = buildMatchupContext(
    session,
    data,
    now.slice(0, 7),
    now,
    message,
  );
  try {
    const text = await generateCoachReply(
      new GoogleGenAI({
        apiKey: env.GEMINI_API_KEY,
        httpOptions: { apiVersion: "v1beta", timeout: 30000 },
      }),
      model,
      context,
      {
        message,
        monthId: context.month,
      },
    );
    if (!text) throw new Error("Empty model response");
    console.log(
      JSON.stringify(
        {
          status: "ok",
          model,
          source: strategy
            ? "deterministic owner fixture (or captured public owner score); captured public matchup; real Gemini; no live writes"
            : "deterministic self-test fixture; real Gemini response; no live league writes",
          wordCount: text.trim().split(/\s+/).length,
          analysis: strategy ? context.analysis : undefined,
          scenario: context.scenarios.find(
            (s) => s.action === "save" && s.amountCents === 2500,
          ),
          text,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.log(JSON.stringify(coachError(error)));
    process.exitCode = 1;
  }
}

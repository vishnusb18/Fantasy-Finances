/** Real Gemini request with a deterministic self-test fixture; never touches the live league. */
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
  const data = nessieToProviderData(
    generatePersonaBundle(MEMBERS[0], now),
    "nessie",
  );
  const result = runFinancePipeline({ data, asOf: now });
  const session = {
    identity: "self-test-fixture",
    playerKey: data.playerId,
    displayName: data.displayName,
    baseline: result.baseline,
    confirmations: {},
    overrides: [],
    players: [],
    scores: [],
    controls: () => true,
    close: () => {},
    connection: {} as LeagueSession["connection"],
  };
  const context = buildMatchupContext(
    session,
    data,
    now.slice(0, 7),
    now,
    "What if I save another $25?",
  );
  try {
    const text = await generateCoachReply(
      new GoogleGenAI({
        apiKey: env.GEMINI_API_KEY,
        httpOptions: { apiVersion: "v1beta", timeout: 20000 },
      }),
      model,
      context,
      {
        message:
          "What if I save another $25? Explain the verified scenario concisely.",
        monthId: context.month,
      },
    );
    if (!text) throw new Error("Empty model response");
    console.log(
      JSON.stringify(
        {
          status: "ok",
          model,
          source:
            "deterministic self-test fixture; real Gemini response; no live league writes",
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

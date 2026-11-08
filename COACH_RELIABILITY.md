# Coach reliability fixes

## Causes found in the existing implementation

1. A scenario contained current before/after efficiency and **only the hypothetical forecast**, omitting its baseline forecast and forecast delta. That made it possible to describe a lower month-end estimate as a loss caused by saving, even when saving changed neither score. `simulateMove` already computed both forecasts; the coach was discarding the first one.
2. Scenarios were unvalidated `Record<string, unknown>` objects. The bill scenario also used a different incomplete shape. A prompt was the only barrier against invented arithmetic or mixed metric labels.
3. Any nonempty `response.text` was accepted without inspecting `candidates[0].finishReason`. A `MAX_TOKENS`, safety interruption, or missing completion status could be presented as a finished answer.
4. The service unconditionally sliced completed answers to **5,000 characters**. Previous assistant messages were also cut to 1,200 characters before being supplied as history. Neither cut was labeled as an interruption.
5. There was no completion/token telemetry. The 900-token generation budget and 20-second model timeout had no completion checks. The implementation uses one non-streamed JSON response, so missing/reordered streaming chunks were not a cause.
6. Retry reconstructed history from the current message list. It now retains the exact failed request, including history and request ID, so repeated sends and retries remain consistent.

The confirmed code defects above were reproduced by tests. There were no historical completion logs proving which specific model limit caused the previously reported live cutoff; that is now observable.

## Financial correctness

`CoachScenario` in `src/lib/coach.ts` now has four explicitly labeled engine snapshots: `current`, `baselineForecast`, `hypotheticalCurrent`, and `hypotheticalForecast`. It also includes current and forecast raw-point/percentage-point deltas, eligible points, category before/after points, remaining scoring capacity and target cents, feasibility, and engine verification status.

`server/coach/scenarios.ts` builds this ledger directly from the existing `simulateMove` result. Runtime validation checks cents, finite score/category values, capped and ineligible categories, matching denominators, and deltas against the corresponding snapshot pair. Infeasible scenarios have no invented hypothetical numbers. Missing forecasts stay null. The official scoring and forecasting algorithms are unchanged.

Gemini still analyzes the current context and history, but returns a schema-constrained **explanation plan referencing verified statement IDs**. `verifiedExplanation.ts` validates every reference and renders the exact engine-backed statement. Unknown references, arbitrary prose/numeric fields, malformed JSON, and mismatched statement kinds are rejected. This prevents invented values **and** correct values being placed under an incorrect metric label. The direct what-if answer, paired forecast comparison and cap explanation cannot be omitted by the model. Gemini selects relevant public opponent comparisons and, if useful, one independently feasible alternative.

Money stays in integer cents through calculation; dollars are formatted for display only. Shared `formatEfficiency` / `formatScoreValue` use the existing `round1` precision across coaching and the main matchup, Make a Move, standings, score summary and financial chart displays. Engine percentages are never recomputed from rounded display points. Current and projected deltas can differ by one tenth because they are differences between their respective rounded engine percentages.

## Completion and interface

- Same model and official SDK: `gemini-3.5-flash` by default, honoring `GEMINI_MODEL`. Supported JSON-schema output, 2,048 output-token budget, LOW thinking for Gemini 3 models, 30-second SDK timeout. The browser timeout is 65 seconds to allow authentication and bank retrieval before generation.
- Only a `STOP` result containing a valid explanation plan can complete. `MAX_TOKENS`, missing finish metadata, empty/malformed/unverifiable output and request errors produce a visible error with Retry. No partial assistant message is added or cached.
- Responses explicitly carry `completion: "complete"`; the browser independently requires it. Complete messages are never silently sliced. A 32,000-character guard rejects excessive output as an error rather than truncating it. History is bounded by whole turns and a byte budget.
- Server logs contain model, completion status, prompt/output/thinking/total token counts when available, response length and sanitized error codes. They contain no key, token, user question, financial context, transaction payload or raw SDK error.
- Exact retry requests and IDs are preserved. Duplicate submits are guarded in both client and server. Month/player threads remain isolated, tabs/close preserve conversation state, and long messages wrap and scroll inside the existing dialog.

## Verification

Build passes and **158 tests pass**. The added reliability suite covers capped $25 saving, a partial target, zero current/forecast deltas, ineligible investing, insufficient cash after reserve, invalid paired values, normalized public opponent fractions, rejected numeric/prose conflicts, long complete responses, `MAX_TOKENS`/missing/safety interruptions, malformed output, safe telemetry, duplicate requests and whole-message history. All six sample players still pass the existing page-render smoke checks.

Two actual Gemini calls using deterministic financial fixtures completed with `STOP`:

| Scenario | Current → hypothetical | Baseline forecast → hypothetical forecast | Point change |
| --- | --- | --- | --- |
| Save $25, partial savings target | 88.2% → 94.8% | 52.2% → 58.7% | +5.2 raw points; +6.6 current percentage points / +6.5 forecast percentage points |
| Save $25, savings already 25/25 | 100.0% → 100.0% | 63.9% → 63.9% | Zero current and forecast changes |

Reproduce these with `npm run verify:coach` and `npm run verify:coach -- --maxed`. Fixtures are clearly labeled and do not write to Nessie or SpacetimeDB. Live owner-session authentication/privacy tests remain in the suite; the existing live players were not taken over for verification.

Browser transport fixtures additionally test a response longer than 5,000 characters on desktop and mobile, visible interruption/retry, rejection of an HTTP-success response with incomplete status, repeated Enter, preserved follow-up history, month isolation and focus behavior. Results/screenshots: `artifacts/drifblim/reliability-checks.json`, `long-answer-desktop.png`, `long-answer-mobile.png`. These UI fixtures are not represented as live Gemini responses.

Official SDK references: [GenerateContentResponse](https://googleapis.github.io/js-genai/release_docs/classes/types.GenerateContentResponse.html), [GenerateContentConfig](https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html).

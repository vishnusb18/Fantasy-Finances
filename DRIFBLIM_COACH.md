# Shiny Drifblim coach

Run `npm run dev` and open http://localhost:5173/. After PLAY finishes, Drifblim appears underneath My Finances. Click the companion from any tab to open the coach; Escape or Close returns focus to its nook. The exact supplied transparent sprites live in `public/assets/mascot/` and remain byte-for-byte unchanged.

See [COACH_RELIABILITY.md](COACH_RELIABILITY.md) for paired scenario validation, structured Gemini explanations, completion checks and the reliability test results.

See [COACH_STRATEGY.md](COACH_STRATEGY.md) for concise matchup replies, verified point-gap rankings, category availability and the Maya/Alex checks.

## Server and model

- `POST /api/coach/chat` runs in the existing Vite server, alongside the Make a Move middleware. No separate process is needed for local development.
- Vite's server-side `loadEnv(mode, process.cwd(), '')` loads `GEMINI_API_KEY`, `NESSIE_API_KEY`, and optional `GEMINI_MODEL` from `.env.local`. Only the server receives these secrets; the client bundle contains neither key.
- The official `@google/genai` SDK calls `models.generateContent`, with default model **`gemini-3.5-flash`**, API version `v1beta`, a 30-second model timeout and 2,048-token output budget. `GEMINI_MODEL` overrides the default. This model was verified with the configured key.
- Request fields are `message`, `monthId`, optional bounded `history`, `requestId`, and an optional `expectedPlayerKey` consistency check. The existing SpacetimeDB bearer token is sent in the Authorization header. A client player identifier never grants access.
- This follows the existing development-server API pattern. A static `dist/` deployment or `vite preview` alone does not host the coach or the existing banking middleware; a deployed server adapter would be needed for those endpoints.

## Verified context and privacy

`server/leagueSession.ts` authenticates the token through SpacetimeDB and requires a live league player actually owned by that identity. The selected-player hint must match. Owner-only views supply the locked baseline, confirmations and category corrections. A baseline row alone cannot establish ownership. Make a Move shares this session reader without changing its transaction or scoring logic.

`server/coach/buildMatchupContext.ts` fetches only the authenticated owner's Nessie bundle, then reuses the financial pipeline, existing category positions, affordability checks and `simulateMove`. The coach receives a compact allowlist of derived values, eligibility, unpaid due dates and verified hypothetical scenarios. It receives no account identifiers, raw income or transaction descriptions. Opponent context consists only of public score snapshots and published category fractions from the existing shared round-robin schedule. Unpublished categories stay unavailable; the coach never fetches an opponent's bank data.

Missing baselines disable exact private simulations. Historical months retain pending settlement status and do not offer new contribution scenarios. Missing opponents allow owner-only coaching. Every Gemini answer is read-only: no tools, writes, transfers or reducers are available to the model. Current scores remain unchanged.

Conversations stay in memory, separated by source, authenticated selected player and month. Closing or changing tabs preserves the thread; changing month isolates its history. Requests are bounded to 1,200 characters, 12 history turns and 20 KB. Duplicate requests are guarded, authenticated usage is limited to six questions per minute, concurrent requests are limited, and responses are not cached by HTTP. Errors preserve the question and offer retry, without fake AI responses.

## Main implementation files

- `src/app/coach/FloatingShinyDrifblim.tsx`: sidebar/mobile home and close lifecycle.
- `src/app/coach/useDrifblimMotion.ts`: constrained two-second drift, visibility pause and reduced motion.
- `src/app/coach/DrifblimCoachDialog.tsx`: 720 ms shared-element flight, pose crossfade, unfolding dialog, focus trap and scroll lock.
- `src/app/coach/CoachMessageList.tsx`, `useCoachConversation.ts`, `coachApi.ts`: safe text rendering, retry, scoped history and typed HTTP transport.
- `src/drifblim-coach.css`: responsive space-and-gold styling and animation.
- `server/coach/coachRoutes.ts`: authenticated endpoint, validation, rate limits and real Gemini generation.
- `server/coach/buildMatchupContext.ts`: auditable financial context and deterministic scenarios.
- `src/lib/competition/pairings.ts`: the existing round-robin schedule shared with the coach.
- `src/App.tsx`, `Competition.tsx`, `FinancePage.tsx`, `EntryExperience.tsx`: minimal mascot placement, visible-month reporting and post-ATM gating.

## Verification

- `npm run build`, `npm test`: build passes; 173 tests pass, including context privacy, affordability, historical/pending states, projections, request validation, rate limits, retries and actual session-ownership gates. Existing Make a Move tests still pass.
- `npm run smoke`: all six sample players render across Matchup, League, Reports and finance sections.
- `npm run verify:coach`: makes a **real Gemini request** using the same production generation function and a deterministic financial test fixture. It never writes live league data. The configured model returned the verified $25 savings scenario: 88.2% → 94.8%, +6.6 percentage points / +5.2 raw earned points. The script clearly labels the fixture and prints no credentials.
- Browser checks and screenshots are in `artifacts/drifblim/`. They cover ATM gating, drift, flight, keyboard focus, month isolation, mobile layouts, reduced motion, offline errors and endpoint rejections. Chat transport tests use explicitly labeled fixtures for retry and follow-up behavior.
- Exact sprite hashes match the package. Neither server secret appears in the built client assets.

**Live-session verification limit:** all six existing live players already belong to existing identities. A fresh test browser cannot authenticate as those owners, so no existing player was taken over and no banking/league records were changed. Real Gemini generation and deterministic context are verified separately from authenticated transport/UI tests. A complete live Nessie → owner-session → Gemini chat still needs to be exercised in the browser session that owns the selected player. Select Nessie (live) and keep SpacetimeDB connected; offline sample mode intentionally reports that verified live coaching is unavailable.

SDK reference: https://googleapis.github.io/js-genai/release_docs/index.html

# CODEX — Fantasy Finance UI Polish V5 (LATEST REQUIREMENTS)

## What you are modifying

**Work in the user's REAL, RUNNING Fantasy Finance React/Vite application at `http://localhost:5173/`, inside the existing repository.** Open that page in the browser available to your coding environment, inspect the current pages and code, and IMPLEMENT the changes below. The `reference_webapp/index.html` and PNGs in this bundle show the latest **purple background / warm-gold ticket** design that the user wants to preserve. These reference files PRECEDE the polish requests below, so the new requirements override any conflicting text or screenshots. Do not generate a different concept, don't replace the running app with the standalone HTML, and don't start from old blue/coral examples.

**Priority number one across EVERY page: CLEAN UP UNNECESSARY HELPER TEXT.** The current app is far too wordy. Apply the content-reduction checklist below as part of implementation, not as an optional later pass.

## Changes to implement, in priority order

### 1. Remove excess helper copy across the entire app (CRITICAL)

Perform a full screen-by-screen copy audit of Matchup, League, Reports, My Finances, all headers, cards, modals/expanders, and mobile states.

- Remove redundant explanatory subtitles, repetitive page descriptions, generic "this helps you" marketing copy, tutorial-like paragraph blocks, debug/demo narration, design notes, repeated explanations of how a visualization works, and empty filler text.
- Prefer a short section heading + core visual + key metric. For example: **"Financial positions"**, not a three-line blurb about fantasy-like category competition. **"November 2026"** instead of repeating the selected period in multiple explanatory elements.
- Information that is not immediately necessary for understanding a screen should go in an optional info tooltip, concise expandable "How scoring works" detail, or contextual help icon. Do not render paragraphs under every card.
- Keep crucial labels for **Actual / Projected / Provisional / Final**, eligibility, percentages, and user privacy. Keep accessible screen-reader labels and category/activity history explanations where requested. Never remove information needed to avoid misrepresenting financial scores.
- Preserve readable hierarchy and whitespace; *do not replace clutter with new decorative chips or made-up status text.*
- Target visual density similar to a real fantasy sports application: the UI should be understood through scores, tickets, charts and concise labels, not instructions.
- Acceptance check: review all four pages and remove any visible sentence that merely narrates the UI, repeats a heading, or describes the hackathon/prototype itself.

### 2. Ripple/pop animation for the five bubbles ON MATCHUP MONTH CHANGE

The existing 5-bubble progress meters stay, exactly five bubbles per player/category. Each bubble represents 20% of that category's earned/max ratio; support partial fills.

- When users move to **previous or next month**, updated bubbles should visibly **pop with a soft expanding ripple**: small scale-in (e.g. 0.82 → 1.12 → 1.0) combined with a ring expanding out and fading. Keep it polished rather than bouncy/cartoonish.
- Stagger bubbles slightly left-to-right within a ticket (e.g. ~35–55 ms), with a total row animation around 400–600 ms; avoid introducing lag across a long matchup page.
- All left/right category bubble groups should react to the period change, showing the NEW month's real category ratios. Different scores should produce different filled/partial states.
- Trigger on month change, not on incidental hover, general rerenders, pie-selection changes, or every tiny score recompute. Consider a period-change transition ID/state keyed by selected month.
- Respect `prefers-reduced-motion: reduce`: update values immediately without ripple/scale. Prevent layout shift; keep animations transform/opacity-only and avoid costly full-app rerenders.

### 3. Matchup month selector becomes PREVIOUS / MONTH / NEXT arrows

Replace the standard matchup period dropdown with a compact inline month navigation component:

`[ ← ]   November 2026   [ → ]`

- Put it where matchup period selection currently lives. Center month/year label, accessible left/right buttons with hover/focus states and keyboard support.
- Left navigates to previous available month; right navigates to next available month. Bound navigation to months actually available in the app; disable unavailable arrows (including future months with no existing data). No wrapping from newest to oldest.
- Changing month updates matchup participants/results, position points, bubble states, current/projected/final labels, and any derived matchup content **without showing stale data**.
- Support responsive compact layout; consistent purple/gold styling without adding large labels or helper copy.
- If the global month selector remains for other pages, avoid conflicting sources of truth. Matchup uses arrow UI.

### 4. Darker GOLD for NON-TICKET panels — keep tickets LIGHT

Preserve the vibrant purple/violet page background and warm-gold-vs-warm-gold player tickets. Do NOT bring back violet-vs-gold player color assignments.

- The big hero matchup tickets AND the small per-category left/right ticket stubs must stay **light champagne gold** (`#FFE4A2` / `#FFF0C7` or current exact implementation equivalents).
- **Everything that is a non-ticket card/panel** should adopt a noticeably deeper, richer antique-gold material (proposed test tokens: `--panel-gold: #D6AD55`, `--panel-gold-strong: #C9993E`, `--panel-gold-muted: #E1BE73`; tune to match overall UI contrast), including utility panels, finance containers, report sections, league containers/other non-ticket cards.
- Keep readable deep-violet text (`#321C58`), subtle bronze outlines, coherent surface hierarchy and restrained shadows; ensure contrast for text, charts, icons, selected elements.
- Gold should not look neon or muddy. Do not simply apply a global filter that also darkens tickets, text, bubbles, or charts.
- Apply tokens/components consistently instead of one-off overrides.

### 5. Reports: DELETE the Personal Report section; redesign "Points Left on the Bench"

This page should be a **league/monthly recap**, not a personal performance dashboard.

- Remove **Personal Report** entirely from the Reports screen/navigation/filters if present, including the private individual performance block and corresponding redundant helper text. Preserve the league awards/leaderboard/recap data and features that are still useful.
- Add or retain a **single clear report month** control only if reports currently need it, but don't reintroduce a personal report.
- **Replace the old left-on-the-bench bars** with a true grouped comparison chart **BY PERSON**. Each manager has **exactly two adjacent horizontal bars** (or two clean parallel line-like bars) on the SAME 0–100% scale:
  - `Actual` = actual recorded normalized efficiency (solid deep-violet or dark purple ink/track)
  - `Potential` = realistically feasible what-if normalized efficiency (gold/cream contrast, legible against the darker gold panel)
- Show manager name and compact numeric labels, e.g. `Actual 82.4%` and `Potential 90.3%`; optionally an unobtrusive `+7.9 pts` gap label. The paired bars should look like an analytical chart, NOT generic UI progress loaders.
- Use actual and *feasible* potential values derived from the existing deterministic evaluation/counterfactual logic. Potential must consider remaining discretionary capacity, paid/unpaid bills, safety buffers, existing eligible contributions, no double count, and avoid treating hypothetical trades/returns as earned points. If the app has no defensible potential value, show `—`/`Unavailable` rather than inventing percentages.
- Do NOT change official scores, match results, standings, or leaderboard points based on hypothetical bars. Handle equal actual/potential; sort or display players in sensible league order; responsive layout and axis labels.
- A small legend `Actual` and `Potential` is enough — remove long explanatory text next to the graph.

### 6. My Finances: add a MONTH filter

The **My Finances** page needs its own clear month selector near the top (dropdown or same compact arrow control if consistent with product; user's explicit arrow requirement applies specifically to Matchup).

- Selecting a month updates ALL date-dependent financial data together: selected month's earned-category pie slices, total score, eligible denominators, category legend, activity/transaction drilldown, and month-specific targets/commitments shown on the page.
- Past finalized months vs current provisional/projected view must be labeled correctly. Empty/no-activity months show an honest empty state, no seeded fallback masquerading as live history.
- A selected pie slice should either remain if its category is still eligible or reset predictably to the first available eligible slice on month change.
- Keep hover/tap/keyboard pie exploration and owner-only transaction history working.
- Avoid showing a second conflicting month label/filter elsewhere; keep the screen concise.

## Do not regress existing V4 design/product rules

- Reference exact UI in `reference_webapp/index.html` and screenshots; preserve bright violet app shell, same light-gold ticket material for BOTH players, chopped ticket corners, category ticket-vs-ticket plus central VS, and five-dot bubble meters.
- Preserve the upgraded top-down Formula-style **real illustrated SVG racecars** and mirrored race lanes in League. Do NOT replace cars with emojis or generic dots. Race lanes should always reflect normalized efficiency, not a win probability.
- Keep current league matchups ABOVE standings; show real month-over-month movement `↑3`, `↓2`, `—` only from actual standings history.
- Preserve interactive contributions PIE (not a decorative loading ring), owner-only transaction details, deterministic scores, locked baseline, monthly head-to-head, ineligible category normalization, and provisional/projected/final semantics.
- Leave Nessie/API connections and scoring algorithms intact. Do not install Plaid/SpacetimeDB/Gemini or invent data as part of this UI pass.

## QA — must verify in the RUNNING app, not just the reference HTML

1. Open `http://localhost:5173/` using browser capabilities available to your environment. Inspect the current page and repository, rather than pretending the reference HTML is production.
2. Implement in the existing React/Vite repo. Keep reusable components and theme tokens.
3. Test month arrow navigation with first, middle, and last available months. Verify arrow disabled states, correct content and bubble pop/ripple on every actual month transition, and reduced-motion override.
4. Audit all four pages for redundant helper text; screenshot before/after and confirm tangible copy reduction.
5. Verify light ticket vs dark non-ticket gold hierarchy in desktop and mobile, high text contrast, and no competitor-specific violet/gold splits.
6. Check Reports has **no Personal Report** and "Left on the Bench" uses **two real series per manager** on a common numeric scale (Actual vs Potential), not one generic progress bar.
7. Change My Finances month; ensure pie, selected category, totals and owner transaction list update together with no stale month data.
8. Check League current matchups above standings; racecars still point toward central finish line and standings movement remains accurate.
9. Run build, lint and tests and fix introduced issues. Capture actual app screenshots at desktop ~1440px and mobile ~390px. No horizontal overflow.
10. Report changed files and exactly what you verified. If localhost isn't reachable in your environment, inspect the repo and run its own dev server instead of claiming you reviewed the site.

## Proceed

Make these changes now in the existing codebase. Use the provided V4 source screenshots as design references and this V5 addendum as the most recent requirement whenever they conflict.


---

## Appendix: V4 existing purple-and-gold webapp design specification (superseded by V5 items above where different)

# CODEX — Implement THIS Fantasy Finance Purple & Gold Webapp in the Existing App

## READ FIRST: This is the latest purple-and-gold WEBAPP, not an unrelated design concept

I have provided the **ACTUAL latest, interactive Fantasy Finance purple-and-gold webapp** in this directory:

- **`index.html` — PRIMARY SOURCE OF TRUTH FOR UI / INTERACTIONS.** Open this exact file in a local browser and inspect its HTML, CSS, and JavaScript. It already contains the complete current design: bright violet app background, warm gold/champagne foreground, twin gold matchup tickets, 5-bubble progress, an SVG racecar league view, standings movement, financial pie drilldown, and monthly report cards.
- `matchup-desktop.png` — screenshot of that webapp's matchup page
- `ticket-duel-closeup.png` — screenshot of gold-vs-gold category ticket pair
- `league-desktop.png` — screenshot of current matchups FIRST and standings below
- `racecar-closeup.png` — screenshot of the UPGRADED Formula-style cars in the same purple/gold webapp
- `league-mobile.png` — real 390px viewport screenshot of this updated webapp
- `finances-desktop.png` — screenshot of interactive pie and activity details
- `reports-desktop.png` — screenshot of monthly reports/awards

**DO NOT work from previous blue/coral prototypes. DO NOT regenerate a generic UI from scratch. DO NOT substitute web image searches, generic generated mockups, or unrelated inspiration images for these actual source files. The goal is to bring the existing project as close as practical to the exact look of `index.html`, while retaining real project logic and integrations.** The standalone HTML uses intentionally seeded demonstration data and must not replace actual banking/score state.

## What was just changed in this latest webapp

The league race tracks now use recognizable **top-view open-wheel Formula-style gold race cars** with front and rear aero wings, exposed slick tires, cockpit/halo, body panels, racing numbers, and purple-gold detailing. See `function carArt(number)` in `index.html`. Both cars share the same gold material; one faces right, one is mirrored to face left, and both move toward a center checkered finish line. The race markers are **actual SVG car drawings**, not emoji, rectangles, or sedan icons. Copy/port this SVG design rather than replacing it with a generic car icon.

## Implementation goal

Work in the **current Fantasy Finance application repository**. Inspect repo architecture, stack, routing, state/score stores, current Nessie or offline data adapter, transaction/category model, and styles. Integrate/rebuild its existing screens to match `index.html` visually and behaviorally. Use existing React/TypeScript/Vite if present; do not create a second independent app and call it complete. Preserve current business logic. This is an implementation pass with the latest standalone HTML as a concrete component reference.

### 1. Design theme — use the precise latest webapp palette

- Violet primary page: `#7651C6`
- Light/luminous violet accent: `#8D6BE0`
- Sidebar purple: `#7048C0`
- Gold ticket material: `#FFE4A2`
- Champagne/light gold: `#FFF0C7`
- Brighter trophy accent: `#F4C45B`
- Deep violet text: `#321C58`
- Supporting dark-violet detail: `#62439F`
- Font: Inter; numeric fields tabular.

**NEVER color one matchup player purple and the other gold.** The background/app shell is violet; both opponents' content/tickets are gold. They are differentiated through names, position, initials, small numbering and direction, not separate card materials. Maintain legibility and the pale warm-gold foreground treatment.

### 2. Matchup screen — same layout as this HTML webapp

Replicate `renderMatchup`, `heroTicket`, `positionTicket`, the `.ticket` and `.position-ticket` styling, and `orbRow` (adapt appropriately into React components):

- At top, two large matching warm-gold hero tickets with clipped/cut-in corners and a centered VS medallion. Show manager/team, month state, actual efficiency, earned/eligible points, appropriately qualified projected values and grounded best-position insight.
- Below, every financial position is **two SEPARATE gold admission tickets per row**, with a central category / VS / score-delta section. See the `ticket-duel-closeup.png` screenshot and source markup `.position-tickets`.
- Positions include Dining Out, Nightlife, Entertainment, Shopping, Subscriptions, Savings, Investing, Bills & Debt, plus any real eligible positions currently supported by your data model. Ineligible categories should be clearly marked, not fabricated.
- Each ticket displays the team's identity, earned/max position points and five **progress bubbles**, not bars. Each bubble is 20% of category earned/max. Support filled, partial, empty and sensible animation; category delta can be tied/negative/positive.
- Preserve expand/collapse for grounded scoring explanations, owner-opponent privacy, and mobile adaptation. Use the existing game's normalized per-position scoring and do not expose an opponent's raw budgets, transactions, or account balances.

### 3. League screen — same gold boards and NEW REAL RACE CARS

Replicate `renderLeague` and the CSS `.race-match`, `.race-arena`, `.race-lane`, `.car-runway`, `.race-car`, `.race-finish`, and `function carArt` from THIS `index.html`.

- **Current month matchups must be the first section**, standings beneath.
- Every pairing has two gold-styled open-wheel SVG race cars on separate mirrored lanes with a shared centered checkered finish line. **Keep the new F1-style illustrated cars that are already in this source**; do not replace them with a circle, emoji, colored pill, regular sedan, or plain progress bar.
- **Left manager:** starts at outer-left 0% and approaches center as efficiency approaches 100%. **Right manager:** starts outer-right 0% and approaches center. Their front noses point toward each other. Cars show racing numbers.
- Position derived from actual monthly normalized efficiency, clamped 0–100, using a proper runway width that accounts for the car body (see `.car-runway` in source). Test 0, 50, 100%, narrow screens, and no collision across separate lanes.
- On month/view change animate from start to position, unless `prefers-reduced-motion`. Current and projected values must have distinct labels. **Do not call track progress a win probability.**
- Standings show rank, manager/team, W–L, streak, points for/against, and rank movement relative to the previous finalized month: ↑3, ↓2, —. Calculate from real ranking state if available; if comparison month is missing, display no fabricated movement.
- Keep the pale gold standings row treatment seen in screenshot, consistent on mobile.

### 4. My Finances — interactive score-contribution pie chart

Replicate `renderFinances`, `pieSegments`, the pie SVG segment treatment, legend interactions, and activity detail pane from the actual HTML, while binding to real app data:

- The PIE is of **earned-score contributions** by eligible category, not a loading/progress ring and not a pie of account balances. Differentiate each slice's share of earned points from its own position percentage (earned/max).
- Hover, click, keyboard focus on desktop; tap on mobile; selected slice and legend reflect current selection and update details panel.
- Detail panel contains real owner-only category points, how category scored, and transactions/activity history behind that category. Provide empty states and distinguish pending from posted where score logic requires it.
- Transaction activity explains the score but does not by itself equal points. The deterministic engine must remain source of truth. NEVER show these transactions to opposing managers on a public matchup or league page.
- Design remains a champagne/gold surface, consistent with `finances-desktop.png`.

### 5. Monthly Reports — same visual family as HTML

Replicate report award pennant/featured cards and the left-on-the-bench report structure using real scores. Include most/least efficient manager, improvements, category leaders, actual vs feasible hypothetical counterfactual as available. Hypotheticals must not alter standings, and reports must distinguish provisional from finalized.

### 6. Financial and technical invariants

- This is a **monthly** fantasy competition, not weekly.
- Different income levels compete on efficiency relative to independently system-generated locked budget baselines.
- Official normalized efficiency = `earned eligible points / maximum eligible points * 100`. Preserve ineligibility logic (e.g., not all players should be forced to invest).
- Keep existing settled vs projected scoring behavior, category guards, cash-cycle and opening-balance safeguards, and privacy rules.
- Do not rewrite financial formulas just to match seeded values in the standalone prototype. Seeded demo names/percentages are for visual demonstration ONLY.
- Do not add Plaid, SpacetimeDB, Gemini API, or new infrastructure as part of this visual integration.
- Avoid unnecessary dependency additions; use inline SVG for cars and the existing project chart library or accessible SVG for the pie.
- Refactor as reusable components (`MatchupTicket`, `CategoryDuelRow`, `FiveBubbleMeter`, `RaceCar`, `MirroredRaceMatchup`, `ContributionPie`, `ActivityDetail`, `StandingRow`, `ReportAward`) consistent with the existing repository's conventions.

### 7. Required verification

1. Start by opening `index.html` locally. Compare it with the provided screenshots; identify EXACT fonts, surfaces, category structure, and racecar art.
2. Inspect the live repository, implement the React/TypeScript pages and real data bindings, and retain app behavior.
3. Run the repo's lint/build/test commands. Fix any failures introduced.
4. Open local running project in browser at desktop (e.g., 1440px) and mobile (390px). Verify no horizontal overflow, especially the two category tickets and mirrored cars.
5. Check matching 0%, 50%, 100% lane positions and that both cars point toward center.
6. Check pie hover/click/keyboard selection and activity-history filtering. Check private transaction data stays private.
7. Check standings movement correctly handles up, down, tie/no change, and absent previous-month standings.
8. Share changed files, UI screenshots from the ACTUAL implemented app, tests run, and any remaining nonblocking issues.

**Success:** The existing working Fantasy Finance app visually and behaviorally matches the EXACT PURPLE/GOLD `index.html` webapp in this folder, including its newly upgraded actual Formula race cars, while preserving its real financial data model and scoring engine. Do not stop after creating mockups or another standalone prototype.

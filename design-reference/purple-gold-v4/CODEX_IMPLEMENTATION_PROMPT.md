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

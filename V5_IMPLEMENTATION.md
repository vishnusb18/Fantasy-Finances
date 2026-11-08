# V5 UI polish

Implemented in the existing running app at `http://localhost:5173/`. The supplied [V5 prompt](design-reference/fantasy-finance-v5/CODEX_PROMPT_V5.md) supersedes the preserved [purple/gold V4 HTML](design-reference/purple-gold-v4/index.html).

## Changes

- **Copy:** removed marketing subtitles, repeated period labels, sidebar narration, hackathon footer, tutorial paragraphs, and personal-report blocks. Model definitions and projection assumptions remain in optional disclosures. Actual/Projected/Provisional/Final, eligibility, and owner privacy labels remain visible.
- **Matchup:** `MonthNavigation.tsx` supplies bounded Previous / Month / Next buttons. Every real period transition resets matchup selection to the selected manager's pairing and updates scores synchronously. Five bubbles remain per player/category. Only the keyed bubble groups replay a 360 ms scale/pop plus 420 ms expanding ring, staggered by 45 ms (600 ms total). Reduced motion disables both. Hover and ordinary score renders do not restart them.
- **Materials:** `v5.css` defines shared antique-gold panel tokens. Utility cards, category containers, race boards, standings, finance panels, modals and report pennants use deeper gold. Both opponents' actual admission tickets remain matching light champagne. Violet shell and original Formula SVGs remain.
- **Reports:** removed `PersonalReport` and the personal featured report component. `PotentialComparison.tsx` renders six manager groups, each with two adjacent horizontal SVG series: Actual and Potential, on a shared 0–100 scale. Data remains a finalized league recap with awards, matchups, category leaders and public member drilldowns.
- **Feasible potential:** `reportPotential.ts` reuses the existing counterfactual function with hypothetical available funds conservatively capped by remaining monthly capacity after posted discretionary spending and existing eligible contributions. Existing unpaid-bill, cash-floor, reserve, eligibility and no-double-count rules still execute inside the unchanged engine. Missing cash/capacity or unknown obligations produce Unavailable. Official scores and records never change.
- **My Finances:** `FinancePage.tsx` and `financeMonth.ts` provide one month control for scores, denominators, targets, category pie, activity, obligations and the full ledger. The old separate transaction-month selector is gone. Historical sample views reuse exactly the existing league's finalized fixture periods through an extracted `buildSamplePeriod` helper. Live history uses actual provider records and stored monthly baselines where present, retains pending settlement, and never falls back to synthetic records. Historical views are read-only; current edits/goals remain intact. Undated current balances are omitted from historical profiles. Pie selection stays when eligible, otherwise resets to the first eligible category.

The finance scoring formulas, baseline generator, adapters, live connection and current correction/goal persistence are unchanged. No new infrastructure or dependencies were added.

## Measured visible copy reduction

Counts include rendered names, metrics, labels and transaction rows, with optional disclosures closed, using the same default sample player and current/report periods before and after. This measures overall visible word reduction, not just prose removed.

| Page | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Matchup | 638 | 397 | 38% |
| League | 359 | 241 | 33% |
| Reports | 663 | 287 | 57% |
| My Finances | 740 | 481 | 35% |

Raw counts: [copy-audit.json](artifacts/v5/copy-audit.json).

## Verification

- `npm test`: **95 tests passed**. Added coverage for arrow bounds and accessible states; explicit animation keys; coherent historical views and immutable current state; stored live baselines; pending settlement; no live/sample crossover; historical edit restrictions; two chart series per manager; capacity caps, equal actual/potential and unchanged finalized records.
- `npm run build`: passed.
- `node --import tsx scripts/smoke-render.tsx`: all six players and all existing/new screen sections render without invalid values.
- No lint script is configured in this repository.
- Chrome against the real running app at **1440, 390 and 320 px**: all four destinations without horizontal overflow or JavaScript errors.
- First/middle/last available matchup months: arrows disable correctly, do not wrap, switch participants and real scores, and remove historical projections. Verified exactly 16 position tickets and 80 bubbles, with 80 pop-animation starts on a month transition; pseudo-elements use the ripple animation. Hover does not retrigger. Reduced-motion computed animation is `none`.
- League still has six original illustrated SVG racecars, mirrored toward center, with current matchups before standings. Historical standings/movement logic is preserved.
- Reports contains no personal-report DOM or personal featured blocks; six Actual bars and six Potential bars use matching numeric scales, bounded at 100%.
- Finance month changes update actual totals, pie geometry, period-specific baseline data, private activity dates and all transaction dates together. Savings selection remains across eligible periods. Archived transaction controls are disabled; current personal goals do not alter official targets or scores. Switching back restores the current period exactly. Keyboard pie focus/Enter remains functional.
- Unconfigured live mode displays connection setup without sample charts/history. A real Nessie API call could not be tested without credentials.

## Actual running-app screenshots

| Page | Before (desktop) | After (desktop) | After (mobile) |
| --- | --- | --- | --- |
| Matchup | [Before](artifacts/v5/before/matchup.png) | [After](artifacts/v5/after/matchup-desktop.png) | [Mobile](artifacts/v5/after/matchup-mobile.png) |
| League | [Before](artifacts/v5/before/league.png) | [After](artifacts/v5/after/league-desktop.png) | [Mobile](artifacts/v5/after/league-mobile.png) |
| Reports | [Before](artifacts/v5/before/reports.png) | [After](artifacts/v5/after/reports-desktop.png) | [Mobile](artifacts/v5/after/reports-mobile.png) |
| My Finances | [Before](artifacts/v5/before/my-finances.png) | [After](artifacts/v5/after/my-finances-desktop.png) | [Mobile](artifacts/v5/after/my-finances-mobile.png) |

Details: [paired chart desktop](artifacts/v5/after/bench-chart-desktop.png), [paired chart mobile](artifacts/v5/after/bench-chart-mobile.png), [finalized finance history](artifacts/v5/after/finance-history-desktop.png).

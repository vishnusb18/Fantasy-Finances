# UI polish and pixel-art refinement

Non-ticket panels now share thick square borders with a hard violet/space-black shadow. Matchup category containers use the same styling; the inner gold/green ticket shapes, VS indicators and bubble animations retain their own design. Inset financial rows have borders without additional full shadows.

Reports feature original SVG pixel trophies, a medal, a savings bag, a shield, a flame and an hourglass, chosen by award title. Awards retain the existing winners, metrics and public-performance dialogs. Position Leaders was removed; finalized matchups, close/largest margins, highest efficiency in a loss and the paired Points Left on the Bench chart remain. Reports use the shared month arrows, and the reporting month survives switching tabs, including My Finances.

My Finances displays the former horizontal score-component bars as vertical columns. Heights preserve the existing earned/available percentages, with exact point values above the columns and on hover/focus. Unscored components remain distinct from zero scores. Short labels fit narrow screens; full labels and explanations remain available in the tooltips. The existing contribution pie and editable budget progress indicators are unchanged. Score explanations are collapsed under **Score details**.

## Modified implementation files

- `src/pixel-panels.css`: common border/shadow system and supporting boxes.
- `src/app/Competition.tsx`, `src/App.tsx`: reports, shared month navigation and report-month persistence.
- `src/app/AchievementIcon.tsx`, `src/achievements.css`: original SVG sprites and award hierarchy.
- `src/app/ScoreColumns.tsx`, `src/score-columns.css`: vertical chart, responsive labels and accessible tooltips.
- `src/app/ScoreSection.tsx`, `src/app/FinancePage.tsx`: expose the chart and collapse detailed explanations.
- `src/app/PotentialComparison.tsx`: shorten the collapsed methodology text.
- `src/main.tsx`: load the component styles.

## Validation

- Production build and all 107 tests pass.
- `node --import tsx scripts/smoke-render.tsx` renders all finance sections and competition tabs for all six sample personas.
- Browser checks cover all four tabs at 1440, 1100, 1000, 900, 800, 650, 390 and 320 pixels, without clipped figures, horizontal overflow or shadows crossing the viewport edge.
- Verified report navigation endpoints, month-specific matchup schedules, report-month persistence, award dialogs, column height ratios, baseline alignment, mouse/focus tooltips, pie interactions and historical finance months.
- No remaining visual issues observed at the checked sizes. Existing sample data produces identical award values across finalized months; the matchup schedule still changes by month. Financial models and sample data are unchanged.

## Screenshots

| Page | Desktop | Mobile |
| --- | --- | --- |
| Matchup | [Screenshot](artifacts/ui-polish/matchup-desktop.png) | [Screenshot](artifacts/ui-polish/matchup-mobile.png) |
| Reports | [Screenshot](artifacts/ui-polish/reports-desktop.png) | [Screenshot](artifacts/ui-polish/reports-mobile.png) |
| My Finances | [Screenshot](artifacts/ui-polish/my-finances-desktop.png) | [Screenshot](artifacts/ui-polish/my-finances-mobile.png) |
| Vertical chart | [Detail](artifacts/ui-polish/vertical-chart-desktop.png) | [Detail](artifacts/ui-polish/vertical-chart-mobile.png) |
| League | [Screenshot](artifacts/ui-polish/league-desktop.png) | [Screenshot](artifacts/ui-polish/league-mobile.png) |

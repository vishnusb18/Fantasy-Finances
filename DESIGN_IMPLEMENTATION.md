# Purple & gold V4 integration

The reference package is preserved in [design-reference/purple-gold-v4](design-reference/purple-gold-v4). Its HTML was opened locally and inspected before porting the design to the existing React app. The standalone prototype’s sample scores and financial activity are not used by the implementation.

## Implemented components

- `src/App.tsx`: responsive purple sidebar / mobile tabs, existing source and player controls, existing financial dashboard below the new pie.
- `src/purple-gold.css`: supplied violet/gold palette, notched paired admission tickets, matching opponent materials, pale-gold boards, award pennants and responsive layouts.
- `src/app/MatchupTickets.tsx`: hero tickets, grounded best-position insights, category tickets and five exact 20% bubbles. Existing owner-only expandable explanations remain in `Competition.tsx`.
- `src/app/RaceMatchups.tsx` and `raceCarArt.ts`: original supplied Formula-style SVG cars, opposing lanes and central checkered finish. Runway insets account for half the actual car width at each breakpoint. Left moves right; right moves left. Track placement uses actual normalized efficiency; projected values are labeled separately. Reduced motion disables transitions.
- `src/lib/competition/presentation.ts`: derived prior-finalized-month rank movement and pie geometry, including zero points and a full-circle single-category case.
- `src/app/ContributionPie.tsx`: earned-score share pie; hover, click, focus, Enter and Space activation; synchronized legend and owner-only filtered activity. Category efficiency is shown separately from earned-score share. Pending purchases are labeled as excluded from actual points. Bills use actual obligation records.
- `src/app/ReportHighlights.tsx`: finalized actual-versus-feasible summary and private missed-opportunity cards. Existing report awards, category leaders and score comparisons remain data driven.
- `public/fonts`: locally served Inter weights 400–800 with the SIL Open Font License. No third-party runtime font or image requests are needed.

No financial formulas, official baselines, Nessie adapters, projection assumptions or counterfactual allocation rules were changed in this visual pass. Existing pending/posted, eligibility, net-transfer, private-detail and finalized-record safeguards remain in effect.

## Verification

- `npm test`: 79 tests passed, including new bubble, race-clamp, rank-movement, pie-share, full-circle and owner-activity coverage.
- `npm run build`: passed.
- `node --import tsx scripts/smoke-render.tsx`: passed for all six players and all existing/new screen sections.
- Local Chrome at 1440, 390 and 320 pixels: all four destinations render without horizontal overflow or JavaScript errors.
- Confirmed 16 category tickets, 80 bubbles, owner-only position expansion, and public views without private opponent targets.
- Confirmed normal-motion cars animate from their starting lines on entry; reduced-motion layouts settle without transitions.
- Confirmed every car remains within its own lane at 0%, 50% and 100%, at all three viewport widths. Mirrored transforms point both front noses toward center. Current matchups precede standings.
- Confirmed pie click/hover/focus/Enter/Space selection updates filtered activity; pending dining and posted dining remain distinct, savings activity contains only relevant transfers.
- Confirmed rank up, down, unchanged and absent-previous-period states. Live Nessie mode retains its no-league state and financial dashboard.

There is no lint script in this repository. Live banking could not be exercised without a configured Nessie key; offline mode and the existing live-mode setup state were checked. The prototype’s existing synthetic historical cash-balance limitation remains disclosed in the reports.

## Actual app screenshots

Captured directly from the implemented app, not from the design package:

| View | Desktop | Mobile |
| --- | --- | --- |
| Matchup | [Screenshot](artifacts/purple-gold-v4/matchup-desktop.png) | [Screenshot](artifacts/purple-gold-v4/matchup-mobile.png) |
| League | [Screenshot](artifacts/purple-gold-v4/league-desktop.png) | [Screenshot](artifacts/purple-gold-v4/league-mobile.png) |
| Reports | [Screenshot](artifacts/purple-gold-v4/reports-desktop.png) | [Screenshot](artifacts/purple-gold-v4/reports-mobile.png) |
| My Finances | [Screenshot](artifacts/purple-gold-v4/my-finances-desktop.png) | [Screenshot](artifacts/purple-gold-v4/my-finances-mobile.png) |

Close-ups: [paired tickets](artifacts/purple-gold-v4/ticket-duel-closeup.png) · [race cars](artifacts/purple-gold-v4/racecar-closeup.png).

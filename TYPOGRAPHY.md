# Arcade typography

The app uses locally served Pixelify Sans for all typography, with reusable roles defined centrally in `src/typography.css`:

| Role | Font | Usage |
| --- | --- | --- |
| UI | Pixelify Sans | Navigation, headings, names, buttons, badges and category labels |
| Arcade | Pixelify Sans | Award labels and VS medallions |
| Numbers | Pixelify Sans 500, tabular numerals | Scores, percentages, money, standings numbers, chart labels, dates and financial inputs |
| Data | Pixelify Sans | Dense explanatory prose and transaction descriptions |

The ATM PLAY graphic uses a CSS-tinted copy of the original image region to turn the red pixel artwork gold while retaining its lettering and bevels. The original image asset, aligned accessible hotspot, zoom and entrance fade remain intact. The launch screen also shows the existing FF logo at its top left; the logo fades out on entry.

Pixelify Sans weights 400–700 are in `public/fonts`, with the original SIL Open Font License and copyright notice. Weights 400, 500 and 700 are preloaded in `index.html`. Inter and Press Start 2P are no longer loaded by the application.

Numerical readability uses shared tokens: medium weight 500, positive `0.02em` tracking, 1.4 line height for ordinary numerical text and 1.2 for hero scores. Compact financial labels have a 12px minimum instead of the old 7–10px mobile styles. Header scores retain their responsive 40–48px Actual and 28–32px Projected sizes. Comparing 5/6/8/9 across the original weights showed more open counters at medium weight; the original glyphs remain in use, so no modified font or derivative name is needed. The original pixel grid, outlines and advance widths are intact.

Typography and color assignments are centralized in `src/typography.css`; the old Inter-only root font assignments were removed from the legacy theme files. The palette uses:

- Purple headings and selection: `#B78CFF`
- Hover/focus highlights: `#D6B8FF`
- Text on gold/green cards: `#321C58`
- Text on dark surfaces: `#F5EEFF`
- Gold accents: `#F4C45B`

Financial components/calculations, ticket materials, animations and source integrations are unchanged. The matchup picker uses the same `ArrowNavigation` component as the month picker, with previous/next matchup labels and disabled endpoint arrows. The current pair is announced through a polite live region.

Both matchup header tickets share responsive Actual, Projected, percentage-unit and label sizing. Their numbers use the same deep-purple card text color, including projected values. Racecar numbers use Pixelify Sans as well. Numerical styling is shared through `--font-numeric`, existing semantic value classes and the reusable `.numeric` class. The top-left brand text is 20px on desktop and 19px on small screens.

Non-ticket panel styling lives in `src/pixel-panels.css`: 3px `#28153F` borders, square corners and stepped hard shadows (4px violet `#7850AB`, then 9px space-black `#07040E`). Primary category-row containers use the same system, with 24px gaps between repeated panels. Interactive report panels lift 2px on hover with an 11px outer shadow, unless reduced motion is requested. Nested financial rows and standings use 2px outlines without additional full shadows. Gold and green matchup tickets retain their silhouettes, materials and bubble effects.

Validation: production build and all 107 tests pass. Browser checks across all four pages at 1440, 1100, 1000, 900, 800, 650, 390 and 320 pixels found no horizontal overflow, clipped numerical displays or shadows extending past the viewport. Numeric displays resolve to Pixelify Sans. Wide digit combinations (98.6 and 95.8) fit the smallest matchup cards. Report hover transforms leave layout positions fixed, and reduced motion disables the lift.

Actual app screenshots: [Matchup desktop](artifacts/typography/matchup-desktop.png), [League mobile](artifacts/typography/league-mobile.png), [Reports mobile](artifacts/typography/reports-mobile.png), [My Finances mobile](artifacts/typography/my-finances-mobile.png).

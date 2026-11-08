# Arcade typography

The app now uses three locally served font roles, defined centrally in `src/typography.css`:

| Role | Font | Usage |
| --- | --- | --- |
| UI | Pixelify Sans | Navigation, headings, names, buttons, badges and category labels |
| Arcade | Press Start 2P | Award pennant labels and VS medallions |
| Numbers | Pixelify Sans | Scores, percentages, money, standings numbers, chart labels, dates and financial inputs |
| Data | Inter | Dense explanatory prose and transaction descriptions |

The ATM PLAY graphic remains in the original reference image; no artwork or entrance animation was changed. Its invisible accessible button also has the arcade font role, without introducing visible replacement text.

Pixelify Sans weights 400–700 and Press Start 2P 400 are in `public/fonts`, with their SIL Open Font License files. `src/arcade-fonts.css` follows the existing local Inter loading approach. Critical arcade fonts are preloaded in `index.html` so entering the app does not wait for a remote font request.

Typography and color assignments are centralized in `src/typography.css`; the old Inter-only root font assignments were removed from the legacy theme files. The palette uses:

- Purple headings and selection: `#B78CFF`
- Hover/focus highlights: `#D6B8FF`
- Text on gold/green cards: `#321C58`
- Text on dark surfaces: `#F5EEFF`
- Gold accents: `#F4C45B`

Layout, financial components/calculations, ticket materials, graphics, animations and source integrations are unchanged.

Both matchup header tickets share responsive Actual, Projected, percentage-unit and label sizing. Their numbers use the same deep-purple card text color, including projected values. Racecar numbers use Pixelify Sans as well.

Validation: production build passes. Browser checks across all four pages at 1440, 390 and 320 pixels found no horizontal overflow or clipped headings, navigation, awards or financial figures. Both matchup tickets have matching computed font sizes, weights and deep-purple colors for Actual, Projected, percentage units and labels at 1440, 1100, 1000, 900, 800, 650, 390 and 320 pixels.

Actual app screenshots: [Matchup desktop](artifacts/typography/matchup-desktop.png), [League mobile](artifacts/typography/league-mobile.png), [Reports mobile](artifacts/typography/reports-mobile.png), [My Finances mobile](artifacts/typography/my-finances-mobile.png).

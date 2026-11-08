# The actual Fantasy Finance purple/gold webapp — V4 Codex handoff

This is the specific **latest violet-and-gold Fantasy Finance webapp** discussed in chat, with its race cars upgraded to real SVG Formula-style illustrations. No blue/coral version and no unrelated generated mockups are included.

- `index.html`: OPEN THIS. Full interactive standalone webapp with all four pages and updated SVG racing cars.
- `CODEX_IMPLEMENTATION_PROMPT.md`: instructions for integrating that exact UI into your current working Fantasy Finance project while preserving scoring/data.
- `matchup-desktop.png`, `ticket-duel-closeup.png`: latest golden ticket visuals.
- `league-desktop.png`, `racecar-closeup.png`, `league-mobile.png`: latest live racecar visuals and league design.
- `finances-desktop.png`, `reports-desktop.png`: latest full app page references.

How to give it to Codex:
1. Extract the directory into your working app repository (for example `design-reference/fantasy-finance-v4/`).
2. Tell Codex: "Implement `design-reference/fantasy-finance-v4/CODEX_IMPLEMENTATION_PROMPT.md`, using **that folder's index.html** and the included screenshots as the source of truth."
3. Open `index.html` locally to review the interaction design before porting to React.

`index.html` is a standalone **visual prototype with seeded sample values**. The real project must use the existing Nessie/offline data and scoring engine.

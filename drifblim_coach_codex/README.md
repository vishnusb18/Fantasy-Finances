# Fantasy Finance Shiny Drifblim + Gemini coach

This directory is a complete single-prompt Codex handoff.

Included:
- `CODEX_PROMPT.md`: full implementation prompt.
- `assets/shiny-drifblim-floating.png`: exact user-supplied 96x96 floating sprite.
- `assets/shiny-drifblim-front.png`: exact user-supplied 120x120 front-facing sprite.

Instructions:
1. Extract this directory into the root of your existing Fantasy Finance repo.
2. Ask Codex to read `fantasy-finance-drifblim-gemini-handoff/CODEX_PROMPT.md` and implement it.
3. The Gemini key is assumed to exist in a **server-only** env variable. Never check it in or give it to the Vite frontend.
4. This is a *feature implementation*, not a separate demo site. The current app, score engine, Nessie and SpacetimeDB integrations must stay intact.

Note: Existing Shiny Drifblim imagery is supplied by the user; no new mascot art has been generated here.

# Make a Move

The Matchup heading now includes a compact purple/gold-sparkle trigger. Its floating panel follows the supplied reference: chamfered corners, double lavender edge, dark-purple surface, gold action tiles and compact efficiency pills. Desktop positioning follows the trigger and clamps to the viewport. Mobile uses an internally scrolling sheet. Escape, outside click, trigger toggle and the close button dismiss it; keyboard focus returns appropriately. Opening it never changes the matchup or shifts the tickets.

## Actions

| Action | Preview | Sandbox execution |
| --- | --- | --- |
| Spend | Five discretionary categories; actual locked category targets and overall cap | Checking-account purchase at the corresponding seeded merchant |
| Save | Checking → identified savings account, using the locked savings target | Synthetic Nessie transfer using the existing destination-description convention |
| Invest | Only when the locked baseline and current engine mark investing eligible | Synthetic Nessie investment-contribution withdrawal; no external investment order |
| Pay a Bill | Existing unpaid bill that has come due, at its actual amount | Preview-only: the existing API cannot atomically debit cash and settle a bill |
| Return | Posted purchase, linked original purchase id, remaining refundable amount | Deposit back to the original checking account; credit-card refunds remain preview-only |

All amounts remain integer cents until the Nessie adapter writes dollars. Preview uses copies of the current provider data with the existing pipeline, locked baseline, category corrections and confirmations. Pending records retain their existing treatment. Spending does not automatically lower scores and saving does not automatically increase them: the engine decides. Raw earned points and percentage-point changes are displayed separately. The opponent prop contains only their name and public actual/projected efficiency, never their private transactions or budget.

## Execution boundary

Preview calls no network API and publishes no score. Execution requires a separate checked confirmation and active-month ownership of the selected player's displayed matchup. The server verifies the SpacetimeDB token and live controller, reads the owner's private locked baseline/corrections/confirmations, and fetches fresh Nessie data. Stale previews, insufficient cash after bills/reserve/minimum floor, invalid refunds and unsupported actions fail before writing.

Only the application's synthetic customer names, seed address and expected owned account nicknames/types qualify. The endpoint also pins the Nessie sandbox origin. The API key stays in `.env.local`, server-side; it is absent from the browser bundle.

A durable, gitignored `.sandbox-moves/journal.json` reserves each confirmation id before sending. Duplicate submissions only reconcile the original ledger record and publication. Uncertain writes block a new move until reconciled. The browser preserves unfinished confirmations for same-player/current-month recovery after a reload. Successful execution re-fetches the real ledger, recalculates using the locked baseline, publishes via the existing reducer and refreshes through the existing subscriptions. No second bot loop is introduced.

The execution endpoint is supplied by the Vite development server for the requested local application. A production static deployment would also need this server handler. The actual shared Nessie/bot league was not mutated during verification: write/retry/publication tests use injected in-memory Nessie and ownership dependencies.

## Files

- `src/app/MakeAMove.tsx`, `src/make-a-move.css`: trigger, reference-style panel, actions, preview, confirmation and recovery.
- `src/lib/competition/moves.ts`: shared pure simulation, validation, refunds, impact deltas and semantic staleness snapshots.
- `server/sandboxMoves.ts`, `vite.config.ts`, `.gitignore`: authenticated sandbox endpoint and durable idempotency journal.
- `src/app/Competition.tsx`: heading placement and typed own-player/public-opponent context.
- `src/app/useFinance.ts`, `src/app/spacetime.tsx`: controlled-player refresh on score subscriptions and authenticated execution access.
- `scripts/sim-league.ts`: reuses the shared pure evaluator; its personalities, planning and loop remain unchanged.
- `src/main.tsx`: dedicated stylesheet import.
- `tests/moves.test.ts`: deterministic simulations, eligibility, affordability, refund limits, stale/unauthorized execution, confirmation, idempotency, uncertain requests, read-back and publication recovery.

## Validation and screenshots

Production build and 124 tests pass. Browser checks cover heading placement, no layout shift, close/focus behavior, all five tiles, spending/saving/refund previews, eligible versus ineligible investing, stale inputs, affordability errors and historical read-only behavior. Panels fit 1440, 1100, 800, 650, 390, 320 pixels and 844×390 landscape, with no horizontal overflow. Preview checks recorded zero API writes. Financial simulations and write/publication separation use deterministic fixtures; real sandbox writes were intentionally not performed against the running bot league.

- [Closed button](artifacts/make-a-move/closed-desktop.png)
- [Expanded desktop](artifacts/make-a-move/expanded-desktop.png)
- [Expanded mobile](artifacts/make-a-move/expanded-mobile.png)
- [Positive savings impact](artifacts/make-a-move/positive-save.png)

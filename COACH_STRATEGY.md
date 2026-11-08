# Concise, verified matchup strategy

Ordinary matchup questions now produce three short conversational paragraphs: the largest verified category gaps, the opponent's actual category edges, then one feasible next move. Strategy replies have a 110-word maximum; ordinary fixture matchups are tested at 70–110 words. They omit repeated totals, privacy notices, provisional-result disclaimers and extra headings. If no category edge exists, the reply says so.

## Analysis before Gemini

`server/coach/matchupAnalysis.ts` constructs the verified analysis before generation:

- Each position distinguishes **scored**, **missing**, **unpublished**, **unscored**, **ineligible** and **invalid** data. A genuine zero requires an explicit, eligible scored record with a positive maximum. Absent values stay null rather than becoming zero.
- Comparable category gaps are ranked by `(opponent earned / opponent max × user max) − user earned`. This measures the point deficit at the user's category weight, rather than ranking percentages or comparing unequal raw caps. Raw point differences and both original earned/max pairs remain available for auditing. Full-credit positions cannot create a positive gap against another valid full-credit position.
- Unearned points and currently recoverable points are separate. Recoverable points require an independently feasible, positive-gain result from the existing simulator. Past spending deductions are not assumed recoverable by new deposits or future restraint.
- Feasible next actions come from the existing save, invest and due-bill simulations, including safe cash, unpaid/upcoming obligations, reserve and floor checks. Actions must improve current points and efficiency without a negative verified forecast delta. They are ranked by verified raw point gain, then lower cash cost. Each option is considered independently, never added together against the same cash.
- The best action records the actual amount in cents, verified point gain, whether it completes the remaining eligible target, and engine provenance. A partial affordable contribution is described as partial. No eligible, feasible gain means no invented recommendation.

`matchupStrategy.ts` prepares concise wording choices from this analysis. Gemini chooses grounded conversational phrasing using the existing JSON explanation-plan integration. The renderer requires exactly one gap paragraph, one opponent-strength paragraph, and the preverified best-action ending, in that order. It rejects invented fields, changed rankings, unknown claims and overlong strategy replies. It does not trust Gemini with new financial arithmetic. Existing completion, timeout, retry, ownership and privacy checks remain in place.

A newly due bill can legitimately activate the existing engine's previously unscored bills component. Scenario validation now preserves and checks its before/after eligibility and point caps, rather than rejecting that valid change as a fabricated gain. The scoring engine itself is unchanged.

## Maya/Alex verification

A read-only subscription to the current public SpacetimeDB matchup on **2026-11-08** found:

- Maya Chen: Dining out 11.7/11.7, Entertainment 5.8/5.8, Shopping 9.3/9.3, Subscriptions 8.2/8.2. Every published scored position is maxed; none is labeled weak.
- Alex Morgan: explicit, eligible 0-point records against those same positive caps. These are genuine zero performances, not missing data.
- Nightlife: explicitly ineligible, 0/0. It is excluded from comparisons.
- Savings, investing and bills: absent from these public snapshots. They remain unpublished, with no fabricated zero or inferred private target/balance.

The captured public-only regression fixture is `tests/fixtures/coach-public-nov2026.json`. The inspection script calls no reducers, claims no player, and fetches no private banking records:

```sh
node --import tsx scripts/coach-public-matchup.ts
```

Two real Gemini calls returned complete, verified strategy answers:

- **82 words**, Maya's deterministic owner fixture plus the captured public Alex scores. It correctly states that Maya is not behind in any comparable category, and ends: “Completing your remaining eligible savings target with $45 would earn another 9.4 points.” This gain is verified against the simulator; the owner finances here are explicitly a test fixture.
- **80 words**, public Alex scores against Maya's captured maxed positions. It identifies the actual Dining out, Shopping and Subscriptions gaps. With no authenticated private baseline in this public-only test, it declines to invent a funded action or point gain.

Reproduce with `npm run verify:coach -- --strategy` and `npm run verify:coach -- --strategy --against-maya`. Full output and safe completion metadata are in `artifacts/drifblim/strategy-maya.txt` and `strategy-against-maya.txt`. These are fixture-based Gemini generation checks, not impersonated live-owner chats.

Build and **173 tests pass**. New tests cover the current Maya/Alex snapshot, all-100% and rounded-to-100% cases, genuine versus missing zeros, weighted point-gap rankings, irreversible spending losses, partial safe funding, unknown bills, newly due bills, mandatory action endings, response order, invalid claims and the word budget across all six financial fixtures. Existing scoring, data integrations, chat UI and mascot animation code are preserved.

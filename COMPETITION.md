# Monthly competition prototype

The Matchup, League, and Reports views run locally on the existing finance pipeline. My Finances retains Nessie live/offline modes, corrections, confirmations, locked baseline revisions, and personal goals. No backend, authentication, AI, or real-time layer was added.

## Scoring v2

Five discretionary positions share 35 points using weights 10/5/5/8/7. An ineligible position's weight is distributed proportionally to the other eligible positions. A baseline category marked ineligible is “overall cap only”; an explicitly eligible zero target earns full points only at zero posted spending. No eligible categories means no available discretionary points.

Posted category spending earns full credit within budget, falling linearly to zero at twice the budget. The overall cap constrains the *entire* spending contribution: if necessary, each category's earned contribution is scaled down proportionally. Unrounded category contributions reconcile with the total; display values round to one decimal. Future optimization is excluded. Investing requires a positive eligible official target. No eligible bills means no bill points in either numerator or denominator.

This intentionally replaces v1's budget-proportional category weights and separate 30% cap component. For example, spending twice the overall cap in an unscored category now earns zero discretionary points instead of retaining 24.5 points. Maya's November 7 fixture still earns 70.6/80 = 88.2% (display rounding). Pending purchases are excluded from actual points and included only in projections. Closing a calendar month is insufficient to finalize while relevant records remain pending. Sample historical fixtures explicitly settle all records.

## Projections

`projectMonthEndScore` is pure. It requires two completed history months and verified income. Remaining variable spending blends historical daily pace (65%) with observed current pace (35%). Historical subscriptions and savings/investing contributions recur only after two matching monthly occurrences with the same merchant/description and day; already observed occurrences are not duplicated. Pending transactions are included once in the projected ledger. Unpaid future bills conservatively remain unpaid rather than assuming completion. This can produce a deliberately low projection early in a month; the UI explains that assumption. No win probabilities are inferred.

## Fixtures and final records

Six synthetic members have separate Nessie-shaped ledgers, obligations, income, and contributions. Three completed monthly periods and the current month use the same adapter, baseline generator and scorer. Their historical account balances are synthetic snapshots, not reconstructed cash balances. This limitation is disclosed beside what-if results. Completed records are deterministic fixtures independent of current-month corrections. A rotation creates monthly opponents; wins/losses/ties and normalized PF/PA are derived from completed matchups. Provisional performance never changes final records. Ties use the displayed one-decimal normalized efficiency. Standings sort by wins plus half of ties, then PF, then stable member ID.

## Feasible potential and privacy

`calculateFeasiblePotentialScore` holds back unpaid obligations, the minimum cash floor, and the profile reserve allocation. It allocates remaining snapshot cash once, first to savings, then eligible investment gaps. It never adds hypothetical market gains, reverses overspending, assumes future income, or changes final records. Missing cash data produces an explicit insufficient-data result.

Public score projections contain identity, earned/eligible points, normalized efficiency, and sanitized position metrics. Opponent budgets, balances, transactions, and payee details are not rendered. Expanded private financial details require the selected sample player to be a participant. Member profiles display public category metrics only. This is a browser simulation, not an access-control boundary; production would need trusted server-side scoring and authorization.

## Validation

Run `npm test`, `npm run build`, and `npm run smoke`. Competition tests cover fixed weights, total reconciliation, zero budgets, pending activity, eligibility, Maya's regression, projections, final records, ties, report generation, safe cash allocation and immutable outcomes.

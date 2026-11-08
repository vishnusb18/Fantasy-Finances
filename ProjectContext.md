# Fantasy Finance — Project Context for Claude Code

## 0. Your assignment and current scope

You are helping design and begin implementing **Fantasy Finance**, a HackUTD 2026 fintech prototype. Read this document as product and engineering context, not as evidence that all technical decisions have already been made.

**Build now, in order:**
1. **Financial Profile:** obtain or simulate a player's financial activity; normalize it into a useful financial picture.
2. **Budget Baseline + Efficiency Scoring:** derive a defensible, personalized monthly budget baseline; score financial behavior against it; expose a transparent score breakdown.

**Do not build yet:** friends/leagues, live matchups, leaderboards, real-time chat, the AI coach/agent, investment forecasting, pots/wagers, or complicated production integrations. These are later phases. Define clean interfaces so they can be added without rewriting the core.

If a repository already exists, inspect its structure before making changes. Reuse existing language/framework choices where sensible. Prioritize a working, testable vertical slice over adding extra technologies.

## 1. Product vision

**Fantasy Finance** is a fantasy-sports-style financial wellness app for young adults. Eventually, two friends will compete in monthly head-to-head matchups, with Sleeper-like recaps, leaderboards, and coaching. The primary score is **financial decision-making efficiency**, not net worth, salary, absolute dollars saved, or investment luck.

Key principle: **Players in different financial situations should be comparable.** A student making $1,000 per month should be able to score as well as someone making $4,000 by making responsible decisions relative to their own realistic capacity.

Financial behavior includes:
- Discretionary spending: dining out / takeout, bars and nightlife, shopping, gaming and other entertainment.
- Recurring subscriptions and avoidable charges.
- Progress toward affordable savings goals.
- On-time bills and responsible debt payments.
- Contributions to investments **when financially appropriate**; market returns are separate and do not determine the main score.

The app should feel modern and polished, not retro arcade or cyberpunk. It should educate and encourage, not shame players for necessary expenses or push risky investments.

## 2. User experience in the current MVP

1. Player starts with a **demo financial profile** (seeded Nessie-like banking data); if a robust Nessie integration is available, allow it as a data source. Do not block development on Plaid access.
2. App shows what it inferred: estimated monthly take-home income, essential expenses, scheduled bills/minimum debt payments, checking liquidity, spending patterns, and detected recurring subscriptions.
3. Player reviews/corrects uncertain data and confirms obligations or income not visible in transactions (e.g., rent paid elsewhere, cash income, shared bills).
4. Budget engine produces a **system-generated monthly competitive baseline** plus a separate editable **personal budget**.
5. Scoring engine calculates a **provisional month-to-date efficiency score**, per-component points, and understandable explanations. Show pending/unknown data rather than inventing certainty.
6. Player can inspect categorized transactions and see which categories contribute to the score. A future version will show friends and an AI coach; do not implement those screens as functioning features yet.

**Crucial anti-gaming rule:** A player can set an easy personal goal for motivation, but it does **not** lower the official scoring benchmark. A user who changes their savings goal from $250 to $25 does not instantly gain a 100% competitive savings score.

## 3. Data sources and normalization

**Capital One Nessie:** Intended hackathon banking/mock-data source. Work with its simulated accounts, customers, purchases, merchants, deposits, transfers, withdrawals, and bills as appropriate. Verify live API endpoints and response shapes against the docs before wiring calls; do not assume the example payloads or all desired signals are available. Nessie may not provide a genuine multi-month salary history, accurate credit score, full investments, or categorized transactions automatically.

**Plaid:** Potential future/data-enrichment integration. Plaid Transactions can provide categorized transactions for linked accounts; external transactions from Nessie require a different enrichment approach (or our own categorizer). **Do not assume Plaid Transactions directly categorizes arbitrary Nessie purchases.** For this MVP, implement a local merchant/category mapping fallback and allow the player to correct categories. Integration with real consumer bank accounts is out of scope unless explicitly requested.

Normalize records into a consistent internal representation, independent of provider:

```ts
type TransactionCategory =
  | 'dining_out' | 'nightlife' | 'entertainment' | 'shopping'
  | 'subscriptions' | 'groceries' | 'housing' | 'utilities'
  | 'transportation' | 'healthcare' | 'income' | 'debt_payment'
  | 'savings_transfer' | 'investment_contribution' | 'other';

type NormalizedTransaction = {
  id: string;
  playerId: string;
  source: 'nessie' | 'plaid' | 'seed' | 'manual';
  sourceTransactionId?: string;
  occurredAt: string;         // ISO timestamp
  amountCents: number;        // explicitly define direction / signed convention
  merchantName?: string;
  category: TransactionCategory;
  kind: 'income' | 'expense' | 'transfer' | 'refund' | 'payment';
  accountId?: string;
  pending?: boolean;
  confidence?: 'high' | 'medium' | 'low';
};
```

Implementation requirements:
- Standardize units/currency, sign convention, dates, and source IDs.
- Deduplicate transactions, including overlapping imported sources or pending-to-posted replacements.
- Exclude transfers between a player's own accounts from income and spending totals.
- Count credit-card **purchases** as expenses; do not count the subsequent card repayment as the same spending again. Still track the required payment obligation for payment-timeliness scoring.
- Handle refunds/reversals and player category corrections.
- Avoid treating one-off transfers, refunds, or investment proceeds as dependable salary.
- Spending category labels can be uncertain; surface that clearly.

## 4. Financial Profile: calculations and required inputs

Aim to construct the following profile for a monthly scoring period:

```ts
type FinancialProfile = {
  playerId: string;
  month: string; // YYYY-MM
  estimatedMonthlyNetIncomeCents: number | null;
  essentialMonthlyExpensesCents: number | null;
  requiredMonthlyDebtPaymentsCents: number | null;
  reserveAllocationCents: number | null;
  availableCheckingBalanceCents: number | null;
  existingSavingsBalanceCents?: number | null;
  categorySpendHistoryCents: Partial<Record<TransactionCategory, number>>;
  obligations: Array<{id: string; amountCents: number; dueDate: string; status: 'paid'|'due'|'overdue'|'unknown'}>;
  dataQuality: Array<'income_unverified'|'missing_obligations'|'limited_history'|'categories_uncertain'|'missing_accounts'>;
  lastCalculatedAt: string;
};
```

**Suggested transparent estimation policy for V1** (configurable, not an externally validated financial standard):
- Net income: median monthly eligible net deposits across **three completed months**, if sufficient history exists. Exclude internal transfers, refunds, loan proceeds, and other irregular windfalls. If insufficient evidence, request a user-confirmed monthly estimate or use an explicitly labeled demo estimate.
- Essentials: median/typical cost of housing, groceries, utilities, basic transportation, and other necessary expenses, **plus manually confirmed obligations not captured in feeds**. Do not double-count rent or bills already represented in categorized spending.
- Required debt payments: minimum contractual/scheduled payments; separate them from optional extra debt repayment.
- Reserve allocation/cash buffer: a transparent configurable safeguard. For demo data, use a conservative fixed illustrative allocation; do not claim a universally correct percentage.
- Checking balance: **liquidity check**, not the primary basis for monthly budgets. Checking balances change around payday and may omit obligations or other accounts.

Calculate the recurring monthly budgetable capacity as:

```text
budgetableCapacity = max(0,
  estimatedMonthlyNetIncome
  - essentialMonthlyExpenses
  - requiredMonthlyDebtPayments
  - reserveAllocation
)
```

This value represents capacity for **additional** discretionary spending, new savings, and optional investment/debt-paydown goals. The reserve allocation is a **held-back buffer**, not simultaneously another scored savings contribution; otherwise we double-count it.

Before suggesting an immediate transfer/action, separately assess available liquidity:

```text
safeToMoveNow = max(0,
  availableCheckingBalance
  - nearTermUnpaidObligations
  - minimumCashFloor
)
```

Do not confuse **what might be sustainable over a whole month** with **what is safe to spend/transfer today**. If net income is uncertain or capacity <= 0, show a cautious plan and avoid unrealistic savings/investment targets.

## 5. Budget Baseline Engine

There are **two distinct budgets**:

**A. `ScoringBaseline` (system-generated, authoritative for the matchup):** Built from the profile at the start of the month, versioned, explainable, and locked for the scoring period. User-defined goals do not weaken it. It contains eligible components, achievable monthly targets, discretionary budget total and category allocations, assumptions, and evidence/quality status.

**B. `PersonalBudget` (player-editable):** Player can choose to focus on dining vs. shopping, or set their own savings goal. This supports planning and motivation, but changing it cannot retroactively inflate the official efficiency score. Users may request corrections to erroneous financial input; genuine corrections should be logged, explained, and applied prospectively or through a controlled recalculation rule—not silently manipulated.

**Initial demo allocation** (illustrative policy, not universal advice): split positive budgetable capacity roughly **50% discretionary / 35% savings / 15% investments**, with rounding and caps. Only assign an investing target to eligible users who have appropriate capacity and no more urgent debt/reserve concerns. If investments are inapplicable, reallocate according to a documented and consistent policy (e.g., toward savings or extra debt payoff), and/or remove the category from scored eligibility. Never penalize a player for not having a brokerage account.

Category budgets within discretionary spending can be based on historical proportions of nonessential spending (dining, nightlife, entertainment, shopping, subscriptions). Allow preferences within the **locked total**. Essentials are protected, not targeted for indiscriminate reductions. Handle an unseen or zero-spend category without divide-by-zero or giving out unreasonable free points.

**Illustrative profile:**

```text
Monthly net income              $3,000
Essentials                     -$1,800
Required debt payments           -$300
Held-back monthly buffer         -$200
--------------------------------------
Budgetable capacity                $700
  discretionary                   $350
  savings                         $250
  investing                       $100  (only when appropriate)
```

The official target should be computed automatically. Someone manually choosing a $25 savings goal while the scoring baseline calls for $250 gets personal-goal completion feedback, **but** earning $25 gives only 10% of the eligible savings points.

Add a function such as:

```ts
generateBudgetBaseline(profile, policy, history): ScoringBaseline
```

Output should include how each target was derived, which values came from verified data vs. user input, and which components are ineligible/uncertain. Preserve the original inputs/policy version for auditability.

## 6. Efficiency Scoring Engine (MVP)

The official score is an **income-normalized, capacity-relative behavior score**. It is NOT a measure of personal worth, net worth, financial advice accuracy, or market performance.

**Proposed initial weights (100 possible points):**

| Component | Base points | Measure |
| --- | ---: | --- |
| Discretionary spending efficiency | 35 | Actual vs. system-approved discretionary/category budgets (dining, nightlife, entertainment, shopping, subscriptions) |
| Savings progress | 25 | Verified **net new** savings vs. system-generated affordable target |
| Bills and debt management | 20 | Timely required payments and obligations; no punishment before due date |
| Investing consistency | 15 | Affordable **net new** contributions toward an eligible investment goal; NOT realized gains or predictions |
| Financial optimization | 5 | Verified, bounded avoidable fees or recurring-cost improvements; only if evidence exists |

If a component is not applicable or reliably observable (e.g., no investment account, no bills due, no verified optimization opportunities), mark it ineligible and normalize against the remaining **available points**. Do not assign a zero merely because the player lacks a financial product. For an initial MVP, optimization may be excluded entirely if proof rules are not robust; normalize the other weights rather than fabricate events.

```text
efficiencyPct = 100 * earnedEligiblePoints / availableEligiblePoints
```

Use deterministic scoring functions with clamps and no LLM decisions.

**Discretionary spending, per eligible category c:**

```text
categoryPoints = categoryWeight * clamp(
  1 - max(0, actualSpend - approvedBudget) / approvedBudget,
  0, 1
)
```

- At/below the approved budget = full category points.
- Overspending reduces the category points proportionally.
- Do **not** award more than full points for spending $0, and don't penalize essential spending.
- If approvedBudget = 0, treat as an explicit ineligible/special case rather than dividing by zero.
- Establish an overall discretionary cap to discourage category gaming; splitting the approved budget across categories cannot increase its total.

**Savings:**

```text
savingsPoints = savingsWeight * clamp(
  verifiedNetNewSavings / systemSavingsTarget, 0, 1
)
```

Savings must reflect actual net progress, not circular transfers, borrowed funds, or the same funds counted repeatedly. Count savings and investing contributions in **separate, mutually exclusive categories**. A large opening savings balance should not itself yield monthly points.

**Investments:** same general contribution-progress formula, only where eligible and affordable. **Do not** use stock return forecasts, lucky portfolio performance, or total Robinhood holdings for core scoring. These may someday drive a separate virtual portfolio feature, not the financial efficiency winner.

**Bills/debt:** score based on what has actually become due in the measurement period. Avoid punishing someone for a bill due next week. When the month is incomplete, show `provisional` and explicit pending obligations; finalize at month end when due/cleared states are known. A user with no eligible obligations should not receive artificial bonus points or automatic zeroes.

**Optimization:** score only verifiable actions (e.g., cancellation verified, fee actually avoided). Avoid paying double for the exact same event as a spending budget improvement if it would distort the category weights.

**Example result:**

```json
{
  "month": "2026-11",
  "status": "provisional",
  "components": {
    "spending": {"earned": 32.6, "available": 35},
    "savings": {"earned": 20, "available": 25},
    "bills": {"earned": 20, "available": 20},
    "investing": {"earned": 9, "available": 15},
    "optimization": {"earned": 2, "available": 5}
  },
  "earnedPoints": 83.6,
  "availablePoints": 100,
  "efficiencyPct": 83.6,
  "explanations": [
    "Dining exceeded its approved budget; this reduced spending points.",
    "Savings reached 80% of the official monthly target."
  ]
}
```

Example assumes all categories are eligible/observable and payment obligations have been satisfied. In real month-to-date data, pending items must be handled explicitly. Avoid suggesting that a provisional score is guaranteed to stay that high.

**Preferred API**:

```ts
calculateEfficiencyScore({
  profile,
  transactions,
  obligations,
  baseline,
  scoringPeriod
}): EfficiencyScoreSnapshot
```

Keep calculations pure and unit-tested. Money in integer cents; use consistent precision/rounding for percentages and points. Include `scoringVersion`, `baselineId`, and per-component explanations in output.

## 7. Technical architecture, MVP only

```text
Nessie mock data / seeded fixtures [Plaid optional later]
           |
           v
  Financial data adapters
           |
           v
  Normalization + classification
           |
           v
  Financial Profile builder  <-- user-confirmed corrections
           |
           v
  Budget Baseline Engine  ---> locked ScoringBaseline
           |                              |
           +------------------------------+
                          |
                          v
              Deterministic Score Engine
                          |
                          v
           Score snapshot + explanations
                          |
                          v
                   MVP dashboard
```

Potential TypeScript modules (adapt to repository conventions):

```text
src/lib/finance/
  adapters/nessie.ts
  adapters/seed.ts
  normalize.ts
  categorize.ts
  profile.ts
  affordability.ts
  baseline.ts
  scoring.ts
  types.ts
  fixtures.ts

src/app/               # if using Next.js
  onboarding/
  dashboard/
  transactions/
  budget/

tests/
  normalize.test.ts
  baseline.test.ts
  scoring.test.ts
```

A Next.js + TypeScript frontend/backend is an acceptable default if no repo exists, but don't force a technology change on an existing project. State/model storage can initially be straightforward (in-memory/seeded fixture or simple database). **SpacetimeDB is a candidate for a later real-time multiplayer backend**, not a prerequisite for validating the financial math. Keep calculation logic portable and independent of any database.

For the MVP UI, prioritize an understandable financial profile page, baseline generation/review page, categorized spending breakdown, and score card with transparent reasoning. Distinguish **official locked benchmark**, **personal editable goals**, and **provisional score**.

## 8. Future phases — context only; do NOT implement yet

**Matchups / social league:** monthly head-to-head comparisons, consistent eligibility normalization, friend groups, real-time leaderboards, weekly Sleeper-like recaps, top and missed plays. Opponents should see only the player's chosen public category scores and aggregate percentages, not raw transactions, balances, income, or bills. SpacetimeDB could power game state and real-time subscriptions. Photon Engine is unnecessary unless a separate game networking requirement emerges.

**AI coach:** a conversational assistant that reads authorized, structured outputs of the scoring engine, explains why the score changed, identifies feasible next actions, and runs **deterministic what-if simulations**; it must never invent score changes, independently decide points, disclose an opponent's private data, or autonomously transfer/invest funds. Future read-only tools might be `getFinancialSummary`, `getScoreBreakdown`, `getMissedOpportunities`, and `simulateDecision`. LLM generation should produce narrative over verified calculations, not finance arithmetic itself. Keep model/provider choice flexible.

**Fantasy bench:** eventual missed-opportunity list, based on actionable, pre-declared opportunities, not hindsight about stock winners. Any wagering/pot feature is out of scope and should not be assumed to be appropriate.

## 9. Acceptance criteria for the first build

The MVP is successful when:

- It can load **at least two synthetic profiles** with substantially different financial situations and explain their assumptions.
- It can normalize/categorize sample transactions, including dining, bars, subscriptions, and essentials.
- It constructs a monthly profile and derives budgetable capacity without relying solely on checking balance.
- It generates a **locked system scoring baseline** and a separately editable personal budget.
- Lowering a self-set personal savings goal does **not** increase the official score.
- It calculates a deterministic efficiency percentage with per-category points, reasons, and pending/unknown states.
- It excludes internal transfers, prevents double-counted card repayments, and doesn't reward investment market gains.
- An ineligible investment category does not automatically lower a player's percentage.
- Unit tests cover: two different incomes, low-goal exploit, missing deposits, zero budget, refunds, transfers, no bills due, month-in-progress, and corrected categorization.
- The UI is good enough to demonstrate a complete story: **financial activity -> inferred profile -> budget baseline -> efficiency score -> explanation**.

## 10. Immediate next steps for Claude Code

1. Inspect existing repo and identify current framework/data setup.
2. Propose a small domain model and explain the budget formula + its assumptions.
3. Implement seeded fixtures and normalized finance types.
4. Implement `buildFinancialProfile(...)` and tests.
5. Implement `generateBudgetBaseline(...)` with locked baseline vs editable plan and tests.
6. Implement `calculateEfficiencyScore(...)` with category explanations, eligibility normalization, and tests.
7. Wire the core flow into a basic polished UI. Integrate Nessie only if it won't jeopardize completing the core demo; leave Plaid as an optional follow-up.
8. Summarize limitations and list future matchup/AI-coach interfaces, **but stop before building them**.

**Product rule to preserve above all:** personal wealth, account balances, arbitrary self-selected goals, and speculative stock returns must not determine who is the better financial manager. Official scoring is based on validated, attainable, individualized baselines and observed behavior.

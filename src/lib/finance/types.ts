// Provider-independent domain model for Fantasy Finance.
//
// MONEY: always integer cents.
// SIGN CONVENTION for NormalizedTransaction.amountCents: signed from the point of
// view of the account the record is booked on (`accountId`).
//   negative = money left that account (purchase, bill payment, transfer out)
//   positive = money entered that account (paycheck, refund, transfer in)
// Scoring code never relies on the sign alone; it uses `kind` + `category`
// and takes magnitudes, so a provider bug in sign cannot double-count.

export const CATEGORIES = [
  'dining_out',
  'nightlife',
  'entertainment',
  'shopping',
  'subscriptions',
  'groceries',
  'housing',
  'utilities',
  'transportation',
  'healthcare',
  'income',
  'debt_payment',
  'savings_transfer',
  'investment_contribution',
  'other',
] as const;
export type TransactionCategory = (typeof CATEGORIES)[number];

export const DISCRETIONARY_CATEGORIES = [
  'dining_out',
  'nightlife',
  'entertainment',
  'shopping',
  'subscriptions',
] as const;
export type DiscretionaryCategory = (typeof DISCRETIONARY_CATEGORIES)[number];

export const ESSENTIAL_CATEGORIES = [
  'groceries',
  'housing',
  'utilities',
  'transportation',
  'healthcare',
] as const;
export type EssentialCategory = (typeof ESSENTIAL_CATEGORIES)[number];

export type Confidence = 'high' | 'medium' | 'low';
export type TransactionKind = 'income' | 'expense' | 'transfer' | 'refund' | 'payment';
export type DataSource = 'nessie' | 'plaid' | 'seed' | 'manual';

export type AccountType = 'checking' | 'savings' | 'credit_card' | 'other';

export type Account = {
  id: string;
  playerId: string;
  source: DataSource;
  type: AccountType;
  nickname: string;
  /** For credit cards this is the amount owed; never used as liquidity. */
  balanceCents: number;
};

export type NormalizedTransaction = {
  id: string;
  playerId: string;
  source: DataSource;
  sourceTransactionId?: string;
  /** ISO date (YYYY-MM-DD). Nessie only provides day precision. */
  occurredAt: string;
  amountCents: number;
  merchantName?: string;
  description?: string;
  category: TransactionCategory;
  kind: TransactionKind;
  accountId?: string;
  /** For transfers: the other account. */
  counterpartyAccountId?: string;
  pending?: boolean;
  confidence: Confidence;
  categorySource: 'user' | 'rule' | 'provider' | 'default';
  /** Transfer between two of the player's own accounts. Never income or spending. */
  isInternalTransfer?: boolean;
  /** Only true for deposits that look like dependable pay (payroll). */
  incomeEligible?: boolean;
};

export type ObligationKind = 'essential' | 'debt_minimum';
export type ObligationStatus = 'paid' | 'due' | 'overdue' | 'unknown';

export type Obligation = {
  id: string;
  playerId: string;
  source: DataSource;
  payee: string;
  kind: ObligationKind;
  amountCents: number;
  dueDate: string; // YYYY-MM-DD
  status: ObligationStatus;
};

export type DataQualityFlag =
  | 'income_unverified'
  | 'missing_obligations'
  | 'limited_history'
  | 'categories_uncertain'
  | 'missing_accounts';

export type ValueSource = 'verified' | 'user_confirmed' | 'policy' | 'missing';

export type FinancialProfile = {
  playerId: string;
  month: string; // YYYY-MM
  estimatedMonthlyNetIncomeCents: number | null;
  essentialMonthlyExpensesCents: number | null;
  requiredMonthlyDebtPaymentsCents: number | null;
  reserveAllocationCents: number | null;
  availableCheckingBalanceCents: number | null;
  existingSavingsBalanceCents?: number | null;
  /** Average per completed month in the history window. */
  categorySpendHistoryCents: Partial<Record<TransactionCategory, number>>;
  obligations: Obligation[];
  dataQuality: DataQualityFlag[];
  lastCalculatedAt: string;
  /** Where each headline number came from. */
  sources: {
    income: ValueSource;
    essentials: ValueSource;
    debt: ValueSource;
    reserve: ValueSource;
  };
  /** Plain-language derivation notes, shown in the UI. */
  notes: string[];
  /** True if the player has made investment contributions in the history window. */
  hasInvestmentActivity: boolean;
};

/** Facts the player confirms that may not be visible in transaction feeds. */
export type PlayerConfirmations = {
  monthlyNetIncomeCents?: number;
  extraMonthlyObligations?: Array<{ label: string; amountCents: number }>;
};

export type CategoryOverride = {
  transactionId: string;
  category: TransactionCategory;
  correctedAt: string;
};

export type BudgetPolicy = {
  version: string;
  split: { discretionary: number; savings: number; investing: number };
  reservePct: number;
  reserveFloorCents: number;
  minCashFloorCents: number;
  /** Targets are rounded down to this many cents ($5 = 500). */
  roundingCents: number;
  investingMinCapacityCents: number;
  historyMonths: number;
  weights: {
    spending: number;
    savings: number;
    bills: number;
    investing: number;
    optimization: number;
  };
  /** Share of the spending component that checks the overall discretionary cap. */
  spendingOverallCapShare: number;
  /** Share of low-confidence spend that triggers the categories_uncertain flag. */
  uncertainCategoryShare: number;
};

export type Derivation = {
  valueCents: number;
  source: ValueSource | 'user_preference';
  explanation: string;
};

export type ScoringBaseline = {
  id: string;
  playerId: string;
  month: string;
  version: number;
  policyVersion: string;
  status: 'locked' | 'needs_input';
  lockedAt: string;
  supersedesId?: string;
  revisionReason?: string;
  inputs: {
    estimatedMonthlyNetIncomeCents: number | null;
    essentialMonthlyExpensesCents: number | null;
    requiredMonthlyDebtPaymentsCents: number | null;
    reserveAllocationCents: number | null;
    sources: FinancialProfile['sources'];
  };
  budgetableCapacityCents: number | null;
  discretionary: {
    eligible: boolean;
    totalCents: number;
    categories: Record<DiscretionaryCategory, { budgetCents: number; eligible: boolean; explanation: string }>;
    explanation: string;
  };
  savings: { eligible: boolean; targetCents: number; explanation: string };
  investing: { eligible: boolean; targetCents: number; explanation: string };
  bills: { eligible: boolean; explanation: string };
  assumptions: string[];
  dataQuality: DataQualityFlag[];
};

export type PersonalBudget = {
  playerId: string;
  month: string;
  baselineId: string;
  categoryBudgetsCents: Record<DiscretionaryCategory, number>;
  savingsGoalCents: number;
  investingGoalCents: number;
  updatedAt: string;
  changeLog: Array<{ at: string; field: string; fromCents: number; toCents: number }>;
};

export type ScoringPeriod = { month: string; asOf: string };

export type ComponentKey = 'spending' | 'savings' | 'bills' | 'investing' | 'optimization';

export type ComponentScore = {
  eligible: boolean;
  basePoints: number;
  earned: number;
  available: number;
  explanations: string[];
};

export type CategoryScoreLine = {
  category: DiscretionaryCategory;
  budgetCents: number;
  actualCents: number;
  pendingCents: number;
  eligible: boolean;
  earned: number;
  available: number;
};

export type EfficiencyScoreSnapshot = {
  scoringVersion: string;
  baselineId: string;
  playerId: string;
  month: string;
  asOf: string;
  status: 'provisional' | 'final';
  components: Record<ComponentKey, ComponentScore>;
  categoryLines: CategoryScoreLine[];
  earnedPoints: number;
  availablePoints: number;
  efficiencyPct: number | null;
  explanations: string[];
  pending: string[];
};

/** Provider-neutral bundle an adapter produces. */
export type ProviderData = {
  playerId: string;
  displayName: string;
  source: DataSource;
  accounts: Account[];
  transactions: NormalizedTransaction[];
  obligations: Obligation[];
};

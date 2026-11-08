import { generateBudgetBaseline } from './baseline';
import { normalizeTransactions } from './normalize';
import { DEFAULT_POLICY } from './policy';
import { buildFinancialProfile } from './profile';
import { calculateEfficiencyScore } from './scoring';
import type {
  BudgetPolicy,
  CategoryOverride,
  EfficiencyScoreSnapshot,
  FinancialProfile,
  NormalizedTransaction,
  PlayerConfirmations,
  ProviderData,
  ScoringBaseline,
} from './types';
import { monthOf } from './util';

export type PipelineInput = {
  data: ProviderData;
  asOf: string;
  overrides?: CategoryOverride[];
  confirmations?: PlayerConfirmations;
  /** Reuse an already-locked baseline for this month instead of generating one. */
  lockedBaseline?: ScoringBaseline;
  policy?: BudgetPolicy;
  now?: string;
};

export type PipelineResult = {
  transactions: NormalizedTransaction[];
  profile: FinancialProfile;
  baseline: ScoringBaseline;
  score: EfficiencyScoreSnapshot;
};

/** Provider data → normalized ledger → profile → (locked) baseline → score. */
export function runFinancePipeline(input: PipelineInput): PipelineResult {
  const policy = input.policy ?? DEFAULT_POLICY;
  const month = monthOf(input.asOf);
  const transactions = normalizeTransactions(input.data.transactions, input.overrides);
  const profile = buildFinancialProfile({
    playerId: input.data.playerId,
    month,
    asOf: input.asOf,
    accounts: input.data.accounts,
    transactions,
    obligations: input.data.obligations,
    confirmations: input.confirmations,
    policy,
    now: input.now,
  });
  const locked =
    input.lockedBaseline && input.lockedBaseline.month === month && input.lockedBaseline.playerId === profile.playerId
      ? input.lockedBaseline
      : undefined;
  const baseline = locked ?? generateBudgetBaseline(profile, policy, { now: input.now });
  const score = calculateEfficiencyScore({
    profile,
    transactions,
    obligations: input.data.obligations,
    accounts: input.data.accounts,
    baseline,
    scoringPeriod: { month, asOf: input.asOf },
    policy,
  });
  return { transactions, profile, baseline, score };
}

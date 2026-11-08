import { useState } from "react";
import {
  budgetableCapacityCents,
  safeToMoveNowCents,
} from "../lib/finance/affordability";
import { DEFAULT_POLICY } from "../lib/finance/policy";
import type { DataQualityFlag } from "../lib/finance/types";
import type { FinanceState } from "./useFinance";
import { Card, Chip, DollarInput, Money, SourceChip, Stat } from "./ui";

const QUALITY_TEXT: Record<DataQualityFlag, string> = {
  income_unverified: "Income unverified",
  missing_obligations: "Possible missing bills",
  limited_history: "Limited history",
  categories_uncertain: "Some categories uncertain",
  missing_accounts: "No checking account",
};

export function ProfileSection({ f }: { f: FinanceState }) {
  const p = f.result!.profile;
  const capacity = budgetableCapacityCents(p);
  const safe = safeToMoveNowCents(p, DEFAULT_POLICY);

  return (
    <Card
      title="Financial profile"
      actions={
        p.dataQuality.length
          ? p.dataQuality.map((q) => (
              <Chip key={q} tone="warn">
                {QUALITY_TEXT[q]}
              </Chip>
            ))
          : null
      }
    >
      <div className="waterfall">
        <Row
          label="Monthly take-home income"
          cents={p.estimatedMonthlyNetIncomeCents}
          badge={<SourceChip source={p.sources.income} />}
        />
        <Row
          label="Essentials"
          cents={p.essentialMonthlyExpensesCents}
          minus
          badge={<SourceChip source={p.sources.essentials} />}
        />
        <Row
          label="Required debt payments"
          cents={p.requiredMonthlyDebtPaymentsCents}
          minus
          badge={<SourceChip source={p.sources.debt} />}
        />
        <Row
          label="Held-back safety buffer"
          cents={p.reserveAllocationCents}
          minus
          badge={<SourceChip source={p.sources.reserve} />}
        />
        <div className="waterfall-total">
          <span>Budgetable capacity</span>
          <strong>
            <Money cents={capacity} />
          </strong>
        </div>
      </div>

      {!f.readOnly && (
        <div className="stats">
          <Stat label="Checking balance">
            <Money cents={p.availableCheckingBalanceCents} />
          </Stat>
          <Stat label="Safe to move">
            <Money cents={safe} />
          </Stat>
          <Stat label="Savings balance">
            <Money cents={p.existingSavingsBalanceCents} />
          </Stat>
        </div>
      )}

      <details className="notes">
        <summary>Profile details</summary>
        <ul>
          {p.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </details>

      {!f.readOnly && <Confirmations f={f} />}
    </Card>
  );
}

const Row = ({
  label,
  cents,
  minus,
  badge,
}: {
  label: string;
  cents: number | null;
  minus?: boolean;
  badge: React.ReactNode;
}) => (
  <div className="waterfall-row">
    <span className="wf-label">
      {label} {badge}
    </span>
    <span className="wf-value">
      {minus && cents != null ? "−" : ""}
      <Money cents={cents} />
    </span>
  </div>
);

function Confirmations({ f }: { f: FinanceState }) {
  const c = f.confirmations;
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState<number | undefined>();
  const extras = c.extraMonthlyObligations ?? [];

  return (
    <details className="confirm notes">
      <summary>Review profile</summary>

      <div className="confirm-grid">
        <div>
          <div className="field-label">Monthly take-home pay</div>
          <DollarInput
            ariaLabel="Monthly take-home pay"
            cents={c.monthlyNetIncomeCents}
            placeholder={
              f.result!.profile.sources.income === "verified"
                ? "Optional"
                : "Required"
            }
            onChange={(v) =>
              f.updateConfirmations({ ...c, monthlyNetIncomeCents: v })
            }
          />
        </div>
        <div>
          <div className="field-label">Bills paid outside these accounts</div>
          {extras.map((o, i) => (
            <div key={i} className="extra-row">
              <span>{o.label}</span>
              <Money cents={o.amountCents} />
              <button
                className="link"
                onClick={() =>
                  f.updateConfirmations({
                    ...c,
                    extraMonthlyObligations: extras.filter((_, j) => j !== i),
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
          <form
            className="extra-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!label.trim() || !amount) return;
              f.updateConfirmations({
                ...c,
                extraMonthlyObligations: [
                  ...extras,
                  { label: label.trim(), amountCents: amount },
                ],
              });
              setLabel("");
              setAmount(undefined);
            }}
          >
            <input
              placeholder="e.g. Rent paid by roommate"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              aria-label="Bill name"
            />
            <DollarInput
              ariaLabel="Monthly amount"
              cents={amount}
              onChange={setAmount}
              placeholder="/mo"
            />
            <button type="submit" className="btn-secondary">
              Add
            </button>
          </form>
        </div>
      </div>
    </details>
  );
}

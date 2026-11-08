import type { ReactNode } from 'react';
import type { Confidence, ValueSource } from '../lib/finance/types';
import { formatCents } from '../lib/finance/util';

export const Money = ({ cents, muted }: { cents: number | null | undefined; muted?: boolean }) => (
  <span className={`money${muted ? ' muted' : ''}`}>{cents == null ? '—' : formatCents(cents)}</span>
);

export const Card = ({ title, subtitle, actions, children, className = '' }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={`card ${className}`}>
    <header className="card-head">
      <div>
        <h2>{title}</h2>
        {subtitle && <p className="sub">{subtitle}</p>}
      </div>
      {actions && <div className="card-actions">{actions}</div>}
    </header>
    {children}
  </section>
);

type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info';
export const Chip = ({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) => (
  <span className={`chip chip-${tone}`} title={title}>
    {children}
  </span>
);

const SOURCE_LABEL: Record<ValueSource, [string, Tone]> = {
  verified: ['From your accounts', 'good'],
  user_confirmed: ['You confirmed', 'info'],
  policy: ['Policy setting', 'neutral'],
  missing: ['Missing', 'warn'],
};
export const SourceChip = ({ source }: { source: ValueSource }) => {
  const [label, tone] = SOURCE_LABEL[source];
  return <Chip tone={tone}>{label}</Chip>;
};

export const ConfidenceChip = ({ c }: { c: Confidence }) =>
  c === 'high' ? null : <Chip tone={c === 'low' ? 'warn' : 'neutral'}>{c === 'low' ? 'Unsure' : 'Likely'}</Chip>;

export const Bar = ({ value, max, tone = 'good' }: { value: number; max: number; tone?: Tone }) => {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="bar" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className={`bar-fill bar-${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
};

export const Stat = ({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) => (
  <div className="stat">
    <div className="stat-label">{label}</div>
    <div className="stat-value">{children}</div>
    {hint && <div className="stat-hint">{hint}</div>}
  </div>
);

/** Dollar input that reports cents. Empty input → undefined. */
export function DollarInput({ cents, onChange, placeholder, ariaLabel }: { cents?: number; onChange: (cents: number | undefined) => void; placeholder?: string; ariaLabel: string }) {
  return (
    <label className="dollar-input">
      <span>$</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="1"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={cents == null ? '' : cents / 100}
        onChange={e => {
          const v = e.target.value;
          onChange(v === '' ? undefined : Math.max(0, Math.round(Number(v) * 100)));
        }}
      />
    </label>
  );
}

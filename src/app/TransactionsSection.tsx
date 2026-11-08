import { useMemo, useState } from 'react';
import { exclusionReason } from '../lib/finance/normalize';
import { categoryLabel } from '../lib/finance/scoring';
import { CATEGORIES, DISCRETIONARY_CATEGORIES, type TransactionCategory } from '../lib/finance/types';
import { addMonths, formatCents, monthOf } from '../lib/finance/util';
import type { FinanceState } from './useFinance';
import { Card, Chip, ConfidenceChip } from './ui';

const DISC = new Set<string>(DISCRETIONARY_CATEGORIES);

export function TransactionsSection({ f }: { f: FinanceState }) {
  const [month, setMonth] = useState(f.month);
  const [filter, setFilter] = useState<'all' | 'scored' | 'unsure'>('all');
  const months = [0, -1, -2, -3].map(d => addMonths(f.month, d));
  const accountName = useMemo(() => new Map(f.data!.accounts.map(a => [a.id, a.nickname])), [f.data]);

  const rows = f.result!.transactions
    .filter(t => monthOf(t.occurredAt) === month)
    .filter(t => (filter === 'scored' ? DISC.has(t.category) && !exclusionReason(t) : filter === 'unsure' ? t.confidence === 'low' : true))
    .reverse();

  return (
    <Card
      title="Transactions"
      subtitle="Fix a category and your profile and score update instantly. Corrections are saved and logged."
      actions={
        <div className="filters">
          <select value={month} onChange={e => setMonth(e.target.value)} aria-label="Month">
            {months.map(m => (
              <option key={m} value={m}>
                {m}
                {m === f.month ? ' (this month)' : ''}
              </option>
            ))}
          </select>
          <select value={filter} onChange={e => setFilter(e.target.value as typeof filter)} aria-label="Filter">
            <option value="all">All</option>
            <option value="scored">Scored spending</option>
            <option value="unsure">Uncertain category</option>
          </select>
        </div>
      }
    >
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(t => {
              const excluded = exclusionReason(t);
              return (
                <tr key={t.id} className={excluded ? 'excluded' : ''}>
                  <td className="nowrap">{t.occurredAt.slice(5)}</td>
                  <td>
                    <div className="tx-name">
                      {t.merchantName ?? t.description ?? '—'} {t.pending && <Chip tone="info">Pending</Chip>}
                    </div>
                    <div className="hint">
                      {t.accountId ? accountName.get(t.accountId) : ''}
                      {excluded ? ` · ${excluded}` : ''}
                    </div>
                  </td>
                  <td>
                    <div className="cat-cell">
                      <select
                        value={t.category}
                        aria-label={`Category for ${t.merchantName ?? t.description}`}
                        onChange={e => f.recategorize(t.id, e.target.value as TransactionCategory)}
                      >
                        {CATEGORIES.map(c => (
                          <option key={c} value={c}>
                            {categoryLabel(c)}
                          </option>
                        ))}
                      </select>
                      {t.categorySource === 'user' ? <Chip tone="info">Corrected</Chip> : <ConfidenceChip c={t.confidence} />}
                    </div>
                  </td>
                  <td className={`num ${t.amountCents > 0 ? 'pos' : ''}`}>{formatCents(t.amountCents)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="empty">
                  No transactions match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

import { describe, expect, it } from 'vitest';
import { nessieToProviderData } from '../src/lib/finance/adapters/nessie/toProviderData';
import type { NessieBundle } from '../src/lib/finance/adapters/nessie/types';
import { categorizePurchase } from '../src/lib/finance/categorize';
import {
  effectiveObligationStatus,
  netCategorySpend,
  netNewSavingsCents,
  normalizeTransactions,
} from '../src/lib/finance/normalize';
import { accounts, bill, spend, toSavings, tx } from './helpers';

describe('categorize', () => {
  it('maps common merchants', () => {
    expect(categorizePurchase('Chipotle').category).toBe('dining_out');
    expect(categorizePurchase('Uber Eats').category).toBe('dining_out');
    expect(categorizePurchase('Uber').category).toBe('transportation');
    expect(categorizePurchase('Truck Yard Bar').category).toBe('nightlife');
    expect(categorizePurchase('Netflix').category).toBe('subscriptions');
    expect(categorizePurchase('H-E-B').category).toBe('groceries');
  });
  it('falls back to provider tags, then low-confidence other', () => {
    expect(categorizePurchase('Some Place', ['bar'])).toMatchObject({ category: 'nightlife', confidence: 'medium' });
    expect(categorizePurchase('Mystery LLC', [])).toMatchObject({ category: 'other', confidence: 'low' });
  });
});

describe('normalizeTransactions', () => {
  it('dedupes the same record imported twice', () => {
    const t = toSavings('2026-11-02', 5_000);
    expect(normalizeTransactions([t, { ...t }])).toHaveLength(1);
  });

  it('replaces a pending charge with its posted version', () => {
    const pending = spend('2026-11-03', 1_250, 'dining_out', { id: 'a', merchantName: 'Chipotle', pending: true });
    const posted = spend('2026-11-05', 1_250, 'dining_out', { id: 'b', merchantName: 'Chipotle' });
    const out = normalizeTransactions([pending, posted]);
    expect(out.map(t => t.id)).toEqual(['b']);
  });

  it('applies the latest category correction and adjusts kind', () => {
    const t = spend('2026-11-03', 4_000, 'other', { id: 'x', confidence: 'low', categorySource: 'default' });
    const out = normalizeTransactions(
      [t],
      [
        { transactionId: 'x', category: 'shopping', correctedAt: '2026-11-04' },
        { transactionId: 'x', category: 'groceries', correctedAt: '2026-11-05' },
      ]
    );
    expect(out[0]).toMatchObject({ category: 'groceries', kind: 'expense', confidence: 'high', categorySource: 'user' });

    const toInvest = normalizeTransactions([t], [{ transactionId: 'x', category: 'investment_contribution', correctedAt: '2026-11-05' }]);
    expect(toInvest[0].kind).toBe('transfer');
  });
});

describe('netCategorySpend', () => {
  it('subtracts refunds and never goes negative', () => {
    const out = netCategorySpend([
      spend('2026-11-02', 5_000, 'shopping'),
      tx({ occurredAt: '2026-11-04', amountCents: 2_000, category: 'shopping', kind: 'refund' }),
      tx({ occurredAt: '2026-11-04', amountCents: 3_000, category: 'dining_out', kind: 'refund' }),
    ]);
    expect(out.shopping).toBe(3_000);
    expect(out.dining_out).toBe(0);
  });

  it('excludes internal transfers and card repayments (no double count)', () => {
    const out = netCategorySpend([
      spend('2026-11-02', 10_000, 'dining_out', { accountId: 'card' }),
      tx({ occurredAt: '2026-11-20', amountCents: -10_000, category: 'debt_payment', kind: 'payment', isInternalTransfer: true, counterpartyAccountId: 'card' }),
      toSavings('2026-11-03', 25_000),
    ]);
    expect(out).toEqual({ dining_out: 10_000 });
  });
});

describe('savings + obligations', () => {
  it('nets circular savings transfers to zero', () => {
    const back = tx({ occurredAt: '2026-11-10', amountCents: -20_000, category: 'savings_transfer', kind: 'transfer', isInternalTransfer: true, accountId: 'sav', counterpartyAccountId: 'chk' });
    expect(netNewSavingsCents([toSavings('2026-11-02', 20_000), back], accounts)).toBe(0);
    expect(netNewSavingsCents([toSavings('2026-11-02', 20_000)], accounts)).toBe(20_000);
  });

  it('never marks a bill overdue before (or on) its due date', () => {
    const b = bill('phone', '2026-11-15', 3_500, 'due');
    expect(effectiveObligationStatus(b, '2026-11-07')).toBe('due');
    expect(effectiveObligationStatus(b, '2026-11-15')).toBe('due');
    expect(effectiveObligationStatus(b, '2026-11-16')).toBe('overdue');
  });
});

describe('Nessie adapter', () => {
  const bundle: NessieBundle = {
    customer: { _id: 'c1', first_name: 'Test', last_name: 'User' },
    accounts: [
      { _id: 'a-chk', type: 'Checking', nickname: 'Chk', balance: 1000, customer_id: 'c1' },
      { _id: 'a-sav', type: 'Savings', nickname: 'Sav', balance: 500, customer_id: 'c1' },
      { _id: 'a-card', type: 'Credit Card', nickname: 'Card', balance: 50, customer_id: 'c1' },
    ],
    merchants: [{ _id: 'm1', name: 'Chipotle', category: ['food'] }],
    purchases: [
      { _id: 'p1', merchant_id: 'm1', payer_id: 'a-card', purchase_date: '2026-11-02', amount: 12.5, status: 'executed', medium: 'balance' },
      { _id: 'p2', merchant_id: 'm1', payer_id: 'a-card', purchase_date: '2026-11-03', amount: 99, status: 'cancelled', medium: 'balance' },
    ],
    deposits: [
      { _id: 'd1', payee_id: 'a-chk', transaction_date: '2026-11-01', amount: 1500, status: 'executed', medium: 'balance', description: 'Payroll - ACME' },
      { _id: 'd2', payee_id: 'a-chk', transaction_date: '2026-11-04', amount: 200, status: 'executed', medium: 'balance', description: 'Venmo from Mom' },
      { _id: 'd3', payee_id: 'a-chk', transaction_date: '2026-11-05', amount: 40, status: 'executed', medium: 'balance', description: 'Vanguard dividend' },
      { _id: 'd4', payee_id: 'a-chk', transaction_date: '2026-11-06', amount: 12.5, status: 'executed', medium: 'balance', description: 'Refund: Chipotle' },
    ],
    withdrawals: [
      { _id: 'w1', payer_id: 'a-chk', transaction_date: '2026-11-03', amount: 100, status: 'executed', medium: 'balance', description: 'Vanguard Roth IRA contribution' },
    ],
    transfers: [
      { _id: 'x1', payer_id: 'a-chk', payee_id: 'a-sav', transaction_date: '2026-11-02', amount: 75, status: 'executed', medium: 'balance' },
    ],
    bills: [
      { _id: 'b1', status: 'completed', payee: 'Lakeside Apartments', nickname: 'Rent', payment_date: '2026-11-01', payment_amount: 1200, account_id: 'a-chk' },
      { _id: 'b2', status: 'pending', payee: 'Capital One', nickname: 'Card payment', payment_date: '2026-11-20', payment_amount: 25, account_id: 'a-chk' },
      { _id: 'b3', status: 'cancelled', payee: 'Old Gym', payment_date: '2026-11-10', payment_amount: 30, account_id: 'a-chk' },
    ],
  };
  const data = nessieToProviderData(bundle, 'nessie');
  const byRaw = (raw: string) => data.transactions.find(t => t.sourceTransactionId === raw);

  it('converts dollars to signed cents and categorizes via merchant', () => {
    expect(byRaw('p1')).toMatchObject({ amountCents: -1250, category: 'dining_out', kind: 'expense', accountId: 'nessie:a-card' });
    expect(byRaw('p2')).toBeUndefined(); // cancelled
  });

  it('only treats payroll as dependable income', () => {
    expect(byRaw('d1')).toMatchObject({ kind: 'income', incomeEligible: true });
    expect(byRaw('d2')).toMatchObject({ kind: 'income', incomeEligible: false });
    expect(byRaw('d3')).toMatchObject({ kind: 'income', incomeEligible: false }); // investment proceeds ≠ salary
    expect(byRaw('d4')).toMatchObject({ kind: 'refund', category: 'dining_out' });
  });

  it('marks internal transfers and investment contributions', () => {
    expect(byRaw('x1')).toMatchObject({ isInternalTransfer: true, category: 'savings_transfer', counterpartyAccountId: 'nessie:a-sav' });
    expect(byRaw('w1')).toMatchObject({ category: 'investment_contribution', kind: 'transfer' });
  });

  it('turns bills into obligations; paid bills also become outflows', () => {
    expect(data.obligations.map(o => [o.payee, o.kind, o.status])).toEqual([
      ['Rent', 'essential', 'paid'],
      ['Card payment', 'debt_minimum', 'due'],
    ]);
    expect(data.transactions.find(t => t.id === 'nessie:bill-b1')).toMatchObject({ category: 'housing', kind: 'expense', amountCents: -120_000 });
  });
});

describe('Nessie adapter — live API shape (transfers without a destination)', () => {
  const live: NessieBundle = {
    customer: { _id: 'c2', first_name: 'Live', last_name: 'Shape' },
    accounts: [
      { _id: 'chk', type: 'Checking', nickname: 'Chk', balance: 100, customer_id: 'c2' },
      { _id: 'sav', type: 'Savings', nickname: 'Sav', balance: 100, customer_id: 'c2' },
    ],
    merchants: [{ _id: 'm', name: 'Netflix', category: 'subscription' }],
    purchases: [],
    deposits: [],
    withdrawals: [],
    // payer_id injected by the client from the request path; no payee_id from the API.
    transfers: [
      { _id: 't1', payer_id: 'chk', transaction_date: '2026-11-02', amount: 75, status: 'completed', medium: 'balance', description: 'Transfer to savings' },
      { _id: 't2', payer_id: 'sav', transaction_date: '2026-11-03', amount: 20, status: 'completed', medium: 'balance', description: 'Transfer to checking' },
      { _id: 't3', payer_id: 'chk', transaction_date: '2026-11-04', amount: 30, status: 'completed', medium: 'balance', description: 'Paid back Sam for dinner' },
    ],
    bills: [],
  };
  const d = nessieToProviderData(live, 'nessie');
  const t = (raw: string) => d.transactions.find(x => x.sourceTransactionId === raw)!;

  it('resolves own-account destinations from the description', () => {
    expect(t('t1')).toMatchObject({ isInternalTransfer: true, counterpartyAccountId: 'nessie:sav', category: 'savings_transfer' });
    expect(t('t2')).toMatchObject({ isInternalTransfer: true, counterpartyAccountId: 'nessie:chk', category: 'savings_transfer' });
    expect(netNewSavingsCents([t('t1'), t('t2')], d.accounts)).toBe(5_500);
  });

  it('treats an unresolvable transfer as money sent out, never as savings', () => {
    expect(t('t3')).toMatchObject({ kind: 'expense' });
    expect(t('t3').isInternalTransfer).toBeFalsy();
  });
});

// Deterministic synthetic customers, emitted as raw Nessie objects.
//
// Used three ways, so they always agree:
//   1. offline sample in the UI (through the real Nessie adapter)
//   2. unit-test fixtures
//   3. scripts/seed-nessie.ts, which POSTs the same data into your Nessie sandbox

import type {
  NessieAccount,
  NessieBill,
  NessieBundle,
  NessieDeposit,
  NessieMerchant,
  NessiePurchase,
  NessieTransfer,
  NessieWithdrawal,
} from '../adapters/nessie/types';
import { addMonths, dayOfMonth, daysInMonth, monthOf } from '../util';

type AccountKey = 'chk' | 'sav' | 'card';

type MerchantSpec = { key: string; name: string; category: string[] };
type SpendPattern = { merchant: string; account: AccountKey; perMonth: number; avg: number; jitter: number; everyOtherMonth?: boolean };
type FixedCharge = { merchant: string; account: AccountKey; amount: number; day: number };
type BillSpec = { payee: string; nickname: string; amount: number; day: number };
type OneOff = {
  monthOffset: number; // 0 = scoring month, -1 = last month …
  day: number;
  kind: 'deposit' | 'purchase' | 'transfer';
  amount: number;
  description: string;
  merchant?: string;
  account?: AccountKey;
  to?: AccountKey;
  status?: 'cancelled' | 'pending';
};

export type PersonaSpec = {
  key: string;
  firstName: string;
  lastName: string;
  blurb: string;
  seed: number;
  accounts: Array<{ key: AccountKey; type: 'Checking' | 'Savings' | 'Credit Card'; nickname: string; balance: number }>;
  paycheck: { amount: number; days: number[]; description: string };
  bills: BillSpec[];
  fixed: FixedCharge[];
  spend: SpendPattern[];
  savingsTransfer?: { amount: number; day: number };
  investing?: { amount: number; day: number; description: string };
  oneOffs: OneOff[];
};

export const MERCHANTS: MerchantSpec[] = [
  { key: 'heb', name: 'H-E-B', category: ['grocery'] },
  { key: 'kroger', name: 'Kroger', category: ['grocery'] },
  { key: 'traderjoes', name: "Trader Joe's", category: ['grocery'] },
  { key: 'walmart', name: 'Walmart', category: ['store'] },
  { key: 'dart', name: 'DART Rail', category: ['transit_station'] },
  { key: 'shell', name: 'Shell', category: ['gas_station'] },
  { key: 'chipotle', name: 'Chipotle', category: ['food'] },
  { key: 'starbucks', name: 'Starbucks', category: ['cafe'] },
  { key: 'torchys', name: "Torchy's Tacos", category: ['food'] },
  { key: 'doordash', name: 'DoorDash', category: ['meal_delivery'] },
  { key: 'truckyard', name: 'Truck Yard Bar', category: ['bar'] },
  { key: 'amc', name: 'AMC Theatres', category: ['movie_theater'] },
  { key: 'mainevent', name: 'Main Event Bowling', category: ['entertainment'] },
  { key: 'steam', name: 'Steam Games', category: ['entertainment'] },
  { key: 'spotify', name: 'Spotify', category: ['subscription'] },
  { key: 'netflix', name: 'Netflix', category: ['subscription'] },
  { key: 'planetfitness', name: 'Planet Fitness', category: ['subscription'] },
  { key: 'target', name: 'Target', category: ['department_store'] },
  { key: 'amazon', name: 'Amazon', category: ['shopping'] },
  { key: 'nike', name: 'Nike', category: ['clothing_store'] },
  { key: 'deepellum', name: 'Deep Ellum Market', category: [] },
];

export const PERSONAS: PersonaSpec[] = [
  {
    key: 'maya',
    firstName: 'Maya',
    lastName: 'Chen',
    blurb: 'Junior, part-time campus job (~$1,050/mo take-home), shared apartment, no investments.',
    seed: 11,
    accounts: [
      { key: 'chk', type: 'Checking', nickname: 'Everyday Checking', balance: 640 },
      { key: 'sav', type: 'Savings', nickname: 'Rainy Day', balance: 900 },
      { key: 'card', type: 'Credit Card', nickname: 'Student Card', balance: 85 },
    ],
    paycheck: { amount: 525, days: [1, 15], description: 'Payroll - UTD Library' },
    bills: [
      { payee: 'Campus Commons Apartments', nickname: 'Rent (my share)', amount: 450, day: 1 },
      { payee: 'T-Mobile', nickname: 'Phone bill', amount: 35, day: 15 },
      { payee: 'Capital One', nickname: 'Card payment (minimum)', amount: 25, day: 20 },
    ],
    fixed: [
      { merchant: 'spotify', account: 'card', amount: 5.99, day: 3 },
      { merchant: 'netflix', account: 'card', amount: 15.49, day: 10 },
    ],
    spend: [
      { merchant: 'heb', account: 'chk', perMonth: 4, avg: 45, jitter: 0.2 },
      { merchant: 'dart', account: 'chk', perMonth: 3, avg: 20, jitter: 0.1 },
      { merchant: 'chipotle', account: 'card', perMonth: 2, avg: 12, jitter: 0.15 },
      { merchant: 'starbucks', account: 'card', perMonth: 3, avg: 7, jitter: 0.2 },
      { merchant: 'amc', account: 'card', perMonth: 1, avg: 16, jitter: 0.1 },
      { merchant: 'target', account: 'chk', perMonth: 1, avg: 32, jitter: 0.25 },
    ],
    savingsTransfer: { amount: 75, day: 2 },
    oneOffs: [
      { monthOffset: -2, day: 12, kind: 'deposit', amount: 200, description: 'Venmo from Mom (birthday)' },
      { monthOffset: -1, day: 9, kind: 'purchase', merchant: 'amazon', account: 'chk', amount: 44, description: 'Textbook' },
      { monthOffset: -1, day: 14, kind: 'deposit', amount: 22, description: 'Refund: Amazon order', account: 'chk' },
      { monthOffset: 0, day: 6, kind: 'purchase', merchant: 'torchys', account: 'card', amount: 14.5, description: 'Lunch', status: 'pending' },
    ],
  },
  {
    key: 'jordan',
    firstName: 'Jordan',
    lastName: 'Reyes',
    blurb: 'Early-career analyst (~$3,000/mo take-home), student loan, contributes to a Roth IRA.',
    seed: 29,
    accounts: [
      { key: 'chk', type: 'Checking', nickname: 'Main Checking', balance: 2150 },
      { key: 'sav', type: 'Savings', nickname: 'High-Yield Savings', balance: 3400 },
      { key: 'card', type: 'Credit Card', nickname: 'Rewards Card', balance: 410 },
    ],
    paycheck: { amount: 1500, days: [1, 15], description: 'Payroll - Lone Star Analytics' },
    bills: [
      { payee: 'Lakeside Apartments', nickname: 'Rent', amount: 1200, day: 1 },
      { payee: 'Navient', nickname: 'Student loan payment', amount: 220, day: 5 },
      { payee: 'TXU Energy', nickname: 'Electric', amount: 95, day: 12 },
      { payee: 'Spectrum', nickname: 'Internet', amount: 60, day: 18 },
      { payee: 'Capital One', nickname: 'Card payment (minimum)', amount: 80, day: 22 },
    ],
    fixed: [
      { merchant: 'netflix', account: 'card', amount: 15.49, day: 4 },
      { merchant: 'spotify', account: 'card', amount: 11.99, day: 8 },
      { merchant: 'planetfitness', account: 'card', amount: 10, day: 17 },
    ],
    spend: [
      { merchant: 'kroger', account: 'card', perMonth: 3, avg: 62, jitter: 0.2 },
      { merchant: 'traderjoes', account: 'card', perMonth: 2, avg: 55, jitter: 0.2 },
      { merchant: 'walmart', account: 'chk', perMonth: 1, avg: 30, jitter: 0.3 },
      { merchant: 'shell', account: 'card', perMonth: 4, avg: 35, jitter: 0.1 },
      { merchant: 'doordash', account: 'card', perMonth: 6, avg: 24, jitter: 0.25 },
      { merchant: 'chipotle', account: 'card', perMonth: 4, avg: 14, jitter: 0.15 },
      { merchant: 'truckyard', account: 'card', perMonth: 3, avg: 32, jitter: 0.3 },
      { merchant: 'mainevent', account: 'card', perMonth: 1, avg: 30, jitter: 0.2 },
      { merchant: 'steam', account: 'card', perMonth: 1, avg: 20, jitter: 0.3, everyOtherMonth: true },
      { merchant: 'amazon', account: 'card', perMonth: 2, avg: 45, jitter: 0.35 },
      { merchant: 'nike', account: 'card', perMonth: 1, avg: 40, jitter: 0.3, everyOtherMonth: true },
      { merchant: 'deepellum', account: 'chk', perMonth: 1, avg: 18, jitter: 0.3 },
    ],
    savingsTransfer: { amount: 250, day: 15 },
    investing: { amount: 100, day: 3, description: 'Vanguard Roth IRA contribution' },
    oneOffs: [
      { monthOffset: -1, day: 20, kind: 'transfer', account: 'sav', to: 'chk', amount: 100, description: 'Transfer to checking' },
      { monthOffset: -2, day: 7, kind: 'purchase', merchant: 'target', account: 'card', amount: 60, description: 'Order cancelled', status: 'cancelled' },
      { monthOffset: 0, day: 6, kind: 'purchase', merchant: 'doordash', account: 'card', amount: 27.8, description: 'Dinner', status: 'pending' },
    ],
  },
];

// Small deterministic PRNG (mulberry32).
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The live Nessie API stores whole dollars (it truncates cents), so the
// generator does the same to keep the offline sample identical to live data.
const money = (x: number) => Math.floor(x);

/**
 * Generate one persona's Nessie bundle: `historyMonths` completed months plus
 * the scoring month up to `asOf`. Same inputs → identical output.
 */
export function generatePersonaBundle(spec: PersonaSpec, asOf: string, historyMonths = 3): NessieBundle {
  const rand = rng(spec.seed);
  const scoringMonth = monthOf(asOf);
  const asOfDay = Number(asOf.slice(8, 10));
  const acct = (k: AccountKey) => `${spec.key}-acct-${k}`;
  const merch = (k: string) => `m-${k}`;

  const accounts: NessieAccount[] = spec.accounts.map(a => ({
    _id: acct(a.key),
    type: a.type,
    nickname: a.nickname,
    rewards: 0,
    balance: a.balance,
    customer_id: `${spec.key}-cust`,
  }));

  const purchases: NessiePurchase[] = [];
  const deposits: NessieDeposit[] = [];
  const withdrawals: NessieWithdrawal[] = [];
  const transfers: NessieTransfer[] = [];
  const bills: NessieBill[] = [];
  const usedMerchants = new Set<string>();
  let n = 0;
  const nextId = (kind: string) => `${spec.key}-${kind}-${++n}`;

  for (let offset = -historyMonths; offset <= 0; offset++) {
    const month = addMonths(scoringMonth, offset);
    const isCurrent = offset === 0;
    const visible = (day: number) => !isCurrent || day <= asOfDay;
    const status = (day: number) => (isCurrent && day >= asOfDay - 1 ? 'pending' : 'completed') as 'pending' | 'completed';
    const date = (day: number) => dayOfMonth(month, day);

    for (const day of spec.paycheck.days) {
      if (!visible(day)) continue;
      deposits.push({
        _id: nextId('dep'),
        type: 'deposit',
        payee_id: acct('chk'),
        transaction_date: date(day),
        amount: money(spec.paycheck.amount),
        status: 'completed',
        medium: 'balance',
        description: spec.paycheck.description,
      });
    }

    for (const b of spec.bills) {
      // Every bill for the month exists; paid only once its date has passed.
      const paid = !isCurrent || b.day < asOfDay;
      bills.push({
        _id: nextId('bill'),
        status: paid ? 'completed' : 'pending',
        payee: b.payee,
        nickname: b.nickname,
        payment_date: date(b.day),
        recurring_date: b.day,
        upcoming_payment_date: null,
        payment_amount: money(b.amount),
        account_id: acct('chk'),
      });
    }

    for (const f of spec.fixed) {
      if (!visible(f.day)) continue;
      usedMerchants.add(f.merchant);
      purchases.push({
        _id: nextId('pur'),
        type: 'merchant',
        merchant_id: merch(f.merchant),
        payer_id: acct(f.account),
        purchase_date: date(f.day),
        amount: money(f.amount),
        status: status(f.day),
        medium: 'balance',
        description: 'Subscription',
      });
    }

    for (const s of spec.spend) {
      const skip = s.everyOtherMonth && Math.abs(offset) % 2 === 1;
      for (let i = 0; i < s.perMonth; i++) {
        // Always draw, so skipping doesn't shift later random values.
        const day = 1 + Math.floor(rand() * daysInMonth(month));
        const amount = money(s.avg * (1 + (rand() * 2 - 1) * s.jitter));
        if (skip || !visible(day)) continue;
        usedMerchants.add(s.merchant);
        purchases.push({
          _id: nextId('pur'),
          type: 'merchant',
          merchant_id: merch(s.merchant),
          payer_id: acct(s.account),
          purchase_date: date(day),
          amount,
          status: status(day),
          medium: 'balance',
          description: 'Card purchase',
        });
      }
    }

    if (spec.savingsTransfer && visible(spec.savingsTransfer.day)) {
      transfers.push({
        _id: nextId('xfer'),
        type: 'p2p',
        payer_id: acct('chk'),
        payee_id: acct('sav'),
        transaction_date: date(spec.savingsTransfer.day),
        amount: money(spec.savingsTransfer.amount),
        status: 'completed',
        medium: 'balance',
        description: 'Transfer to savings',
      });
    }

    if (spec.investing && visible(spec.investing.day)) {
      withdrawals.push({
        _id: nextId('wd'),
        type: 'withdrawal',
        payer_id: acct('chk'),
        transaction_date: date(spec.investing.day),
        amount: money(spec.investing.amount),
        status: 'completed',
        medium: 'balance',
        description: spec.investing.description,
      });
    }

    for (const o of spec.oneOffs.filter(o => o.monthOffset === offset)) {
      if (!visible(o.day)) continue;
      const st = o.status ?? 'completed';
      if (o.kind === 'deposit') {
        deposits.push({
          _id: nextId('dep'),
          type: 'deposit',
          payee_id: acct(o.account ?? 'chk'),
          transaction_date: date(o.day),
          amount: money(o.amount),
          status: st,
          medium: 'balance',
          description: o.description,
        });
      } else if (o.kind === 'purchase' && o.merchant) {
        usedMerchants.add(o.merchant);
        purchases.push({
          _id: nextId('pur'),
          type: 'merchant',
          merchant_id: merch(o.merchant),
          payer_id: acct(o.account ?? 'chk'),
          purchase_date: date(o.day),
          amount: money(o.amount),
          status: st,
          medium: 'balance',
          description: o.description,
        });
      } else if (o.kind === 'transfer' && o.to) {
        transfers.push({
          _id: nextId('xfer'),
          type: 'p2p',
          payer_id: acct(o.account ?? 'chk'),
          payee_id: acct(o.to),
          transaction_date: date(o.day),
          amount: money(o.amount),
          status: st,
          medium: 'balance',
          description: o.description,
        });
      }
    }
  }

  const merchants: NessieMerchant[] = MERCHANTS.filter(m => usedMerchants.has(m.key)).map(m => ({
    _id: merch(m.key),
    name: m.name,
    category: m.category,
  }));

  return {
    customer: { _id: `${spec.key}-cust`, first_name: spec.firstName, last_name: spec.lastName },
    accounts,
    merchants,
    purchases,
    deposits,
    withdrawals,
    transfers,
    bills,
  };
}

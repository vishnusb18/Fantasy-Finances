// Seed the demo personas into your Capital One Nessie sandbox.
//
//   npm run seed:nessie              # dry run: prints what would be created
//   npm run seed:nessie -- --execute # actually POSTs to Nessie
//   npm run seed:nessie -- --execute --only=maya
//
// Reads NESSIE_API_KEY (and optional NESSIE_BASE_URL) from .env.local.
// ⚠ Nessie request fields are from its published docs and unverified here —
// run a dry run first, then --execute, and check the first error carefully.

import { existsSync, readFileSync } from 'node:fs';
import { createNessieClient } from '../src/lib/finance/adapters/nessie/client';
import type { NessieAccount, NessieCustomer, NessieMerchant } from '../src/lib/finance/adapters/nessie/types';
import { generatePersonaBundle, MERCHANTS, PERSONAS } from '../src/lib/finance/demo/personas';
import { isoDate } from '../src/lib/finance/util';

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnvFile('.env.local');

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const only = args.find(a => a.startsWith('--only='))?.slice(7);
const asOf = args.find(a => a.startsWith('--as-of='))?.slice(8) ?? isoDate(new Date());
const apiKey = process.env.NESSIE_API_KEY;
const baseUrl = process.env.NESSIE_BASE_URL || 'https://api.nessieisreal.com';

if (execute && !apiKey) {
  console.error('NESSIE_API_KEY is not set. Add it to .env.local (see .env.example).');
  process.exit(1);
}

const client = createNessieClient({ baseUrl, apiKey });
const DALLAS = {
  address: { street_number: '800', street_name: 'W Campbell Rd', city: 'Richardson', state: 'TX', zip: '75080' },
  geocode: { lat: 32.9857, lng: -96.7502 },
};

async function main() {
  const personas = PERSONAS.filter(p => !only || p.key === only);
  console.log(`${execute ? 'EXECUTING' : 'DRY RUN'} — as-of ${asOf}, ${baseUrl}, personas: ${personas.map(p => p.key).join(', ')}`);

  // Idempotent re-runs: reuse merchants that already exist (by name) and skip
  // customers that already exist (by first + last name).
  const existingMerchants = apiKey ? await client.get<NessieMerchant[]>('/merchants') : [];
  const existingCustomers = apiKey ? await client.get<NessieCustomer[]>('/customers') : [];
  const merchantByName = new Map(existingMerchants.map(m => [m.name, m._id]));

  // Merchants are shared across personas; create each once.
  const merchantIds = new Map<string, string>();
  const needed = new Set(personas.flatMap(p => generatePersonaBundle(p, asOf).merchants.map(m => m._id)));
  let reused = 0;
  for (const m of MERCHANTS.filter(m => needed.has(`m-${m.key}`))) {
    const found = merchantByName.get(m.name);
    if (found) {
      merchantIds.set(`m-${m.key}`, found);
      reused++;
      continue;
    }
    const body = { name: m.name, category: m.category[0] ?? 'other', ...DALLAS };
    if (!execute) {
      merchantIds.set(`m-${m.key}`, `<merchant:${m.key}>`);
      continue;
    }
    const created = await client.post<NessieMerchant>('/merchants', body);
    merchantIds.set(`m-${m.key}`, created._id);
  }
  console.log(`merchants: ${merchantIds.size} (${reused} already in Nessie)`);

  for (const spec of personas) {
    const b = generatePersonaBundle(spec, asOf);
    const counts = { purchases: b.purchases.length, deposits: b.deposits.length, withdrawals: b.withdrawals.length, transfers: b.transfers.length, bills: b.bills.length };
    const already = existingCustomers.find(c => c.first_name === spec.firstName && c.last_name === spec.lastName);
    console.log(`\n${spec.firstName} ${spec.lastName}${already ? ` (exists: ${already._id}, resuming)` : ''}:`, counts);
    if (!execute) continue;

    const customer =
      already ??
      (await client.post<NessieCustomer>('/customers', {
        first_name: spec.firstName,
        last_name: spec.lastName,
        address: DALLAS.address,
      }));

    // Reuse accounts by nickname when resuming a half-seeded customer.
    const existingAccounts = already ? await client.get<NessieAccount[]>(`/customers/${customer._id}/accounts`) : [];
    const acctIds = new Map<string, string>();
    for (const a of b.accounts) {
      const found = existingAccounts.find(x => x.nickname === a.nickname);
      if (found) {
        acctIds.set(a._id, found._id);
        continue;
      }
      const created = await client.post<NessieAccount>(`/customers/${customer._id}/accounts`, {
        type: a.type,
        nickname: a.nickname,
        rewards: 0,
        balance: a.balance,
      });
      acctIds.set(a._id, created._id);
    }
    const acct = (id: string) => acctIds.get(id)!;

    // When resuming, skip any collection that already has data for this
    // customer, so a re-run never duplicates rows.
    const has = async (collection: string) => {
      if (!already) return false;
      for (const id of acctIds.values()) {
        const rows = await client.get<unknown[]>(`/accounts/${id}/${collection}`);
        if (Array.isArray(rows) && rows.length) return true;
      }
      return false;
    };
    const skip = {
      purchases: await has('purchases'),
      deposits: await has('deposits'),
      withdrawals: await has('withdrawals'),
      transfers: await has('transfers'),
      bills: await has('bills'),
    };
    const skipped = Object.entries(skip).filter(([, v]) => v).map(([k]) => k);
    if (skipped.length) console.log(`  already seeded, skipping: ${skipped.join(', ')}`);
    if (skip.purchases) b.purchases = [];
    if (skip.deposits) b.deposits = [];
    if (skip.withdrawals) b.withdrawals = [];
    if (skip.transfers) b.transfers = [];
    if (skip.bills) b.bills = [];

    for (const p of b.purchases) {
      await client.post(`/accounts/${acct(p.payer_id)}/purchases`, {
        merchant_id: merchantIds.get(p.merchant_id),
        medium: p.medium,
        purchase_date: p.purchase_date,
        amount: p.amount,
        status: p.status,
        description: p.description,
      });
    }
    for (const d of b.deposits) {
      await client.post(`/accounts/${acct(d.payee_id)}/deposits`, {
        medium: d.medium,
        transaction_date: d.transaction_date,
        status: d.status,
        amount: d.amount,
        description: d.description,
      });
    }
    for (const w of b.withdrawals) {
      await client.post(`/accounts/${acct(w.payer_id)}/withdrawals`, {
        medium: w.medium,
        transaction_date: w.transaction_date,
        status: w.status,
        amount: w.amount,
        description: w.description,
      });
    }
    for (const t of b.transfers) {
      await client.post(`/accounts/${acct(t.payer_id)}/transfers`, {
        amount: t.amount,
        transaction_date: t.transaction_date,
        status: t.status,
        description: t.description,
      });
    }
    for (const bill of b.bills) {
      await client.post(`/accounts/${acct(bill.account_id)}/bills`, {
        status: bill.status,
        payee: bill.payee,
        nickname: bill.nickname,
        payment_date: bill.payment_date,
        recurring_date: bill.recurring_date,
        payment_amount: bill.payment_amount,
      });
    }
    console.log(`  done: customer ${customer._id}`);
  }
  if (!execute) console.log('\nNothing was sent. Re-run with --execute to create these in Nessie.');
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

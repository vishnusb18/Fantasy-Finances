// Read-only: pull each seeded customer through the real client → adapter →
// pipeline and compare with the offline sample generated from the same persona.
import { readFileSync } from 'node:fs';
import { createNessieClient } from '../src/lib/finance/adapters/nessie/client';
import { nessieToProviderData } from '../src/lib/finance/adapters/nessie/toProviderData';
import { generatePersonaBundle, PERSONAS } from '../src/lib/finance/demo/personas';
import { runFinancePipeline } from '../src/lib/finance/pipeline';
import { isoDate } from '../src/lib/finance/util';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/).flatMap(l => {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    return m ? [[m[1], m[2].replace(/^["']|["']$/g, '')]] : [];
  })
);
const client = createNessieClient({ baseUrl: env.NESSIE_BASE_URL || 'https://api.nessieisreal.com', apiKey: env.NESSIE_API_KEY });
const asOf = process.argv.find(a => a.startsWith('--as-of='))?.slice(8) ?? isoDate(new Date());
const show = process.argv.includes('--raw');

const summarize = (r: ReturnType<typeof runFinancePipeline>) => ({
  income: r.profile.estimatedMonthlyNetIncomeCents,
  essentials: r.profile.essentialMonthlyExpensesCents,
  debt: r.profile.requiredMonthlyDebtPaymentsCents,
  capacity: r.baseline.budgetableCapacityCents,
  discretionary: r.baseline.discretionary.totalCents,
  savingsTarget: r.baseline.savings.targetCents,
  investingTarget: r.baseline.investing.targetCents,
  obligationsThisMonth: r.profile.obligations.map(o => `${o.payee}:${o.status}`).join(', '),
  quality: r.profile.dataQuality.join(',') || 'none',
  efficiencyPct: r.score.efficiencyPct,
  points: `${r.score.earnedPoints}/${r.score.availablePoints}`,
});

for (const c of await client.listCustomers()) {
  const spec = PERSONAS.find(p => p.firstName === c.first_name && p.lastName === c.last_name);
  const bundle = await client.fetchBundle(c._id);
  if (show) {
    for (const k of ['transfers', 'bills', 'withdrawals'] as const) console.log(k, JSON.stringify(bundle[k][0] ?? null));
  }
  if (process.argv.includes('--amounts') && spec) {
    const gen = generatePersonaBundle(spec, asOf).purchases.map(p => p.amount).sort((a, b) => a - b);
    const got = bundle.purchases.map(p => p.amount).sort((a, b) => a - b);
    console.log('sent    :', gen.slice(0, 10).join(' '));
    console.log('stored  :', got.slice(0, 10).join(' '));
    console.log('non-integer stored amounts:', got.filter(x => !Number.isInteger(x)).length, 'of', got.length);
  }
  const counts = Object.fromEntries((['purchases', 'deposits', 'withdrawals', 'transfers', 'bills', 'merchants'] as const).map(k => [k, bundle[k].length]));
  const live = summarize(runFinancePipeline({ data: nessieToProviderData(bundle, 'nessie'), asOf }));
  console.log(`\n== ${c.first_name} ${c.last_name} (live Nessie)`, counts);
  if (!spec) { console.log(live); continue; }
  const offline = summarize(runFinancePipeline({ data: nessieToProviderData(generatePersonaBundle(spec, asOf), 'seed'), asOf }));
  for (const k of Object.keys(live) as (keyof typeof live)[]) {
    const same = JSON.stringify(live[k]) === JSON.stringify(offline[k]);
    console.log(`${same ? '  ✓' : '  ✗'} ${k.padEnd(22)} live=${JSON.stringify(live[k])}${same ? '' : `  offline=${JSON.stringify(offline[k])}`}`);
  }
}

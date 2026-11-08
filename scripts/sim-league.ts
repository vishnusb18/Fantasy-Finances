/**
 * League simulator: five bot players who make financial decisions in Nessie
 * and compete in the SpacetimeDB live league, exactly like real browsers.
 *
 *   npm run sim:league                         # bots = everyone except Maya
 *   npx tsx scripts/sim-league.ts --me=jordan  # you play Jordan; Maya becomes a bot
 *   npx tsx scripts/sim-league.ts --moves=3 --interval=2   # quick test
 *   npx tsx scripts/sim-league.ts --moves=1 --move=payBill # force a move type
 *     (dining | nightlife | fun | shopping | refund | save | invest | dip | payBill)
 *
 * Each bot:
 *   - has its own SpacetimeDB identity (tokens saved in scripts/.sim-tokens.json)
 *   - is a seeded Nessie customer (npx tsx scripts/seed-nessie.ts --execute)
 *   - takes a turn every 10 s (bots rotate in a fixed order). On its turn it
 *     tries several in-character moves against its current data, picks one that
 *     visibly changes its score (savers lean toward gains, splurgers toward
 *     losses), writes it to Nessie, re-scores with the browser's engine and
 *     publishes to the league.
 *
 * ⚠ Every move writes to your Nessie sandbox. Stop with Ctrl+C.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { DbConnection, tables } from '../src/module_bindings';
import { createNessieClient } from '../src/lib/finance/adapters/nessie/client';
import type {
  NessieAccount,
  NessieBill,
  NessieBundle,
  NessieCustomer,
  NessieMerchant,
} from '../src/lib/finance/adapters/nessie/types';
import { nessieToProviderData } from '../src/lib/finance/adapters/nessie/toProviderData';
import { runFinancePipeline } from '../src/lib/finance/pipeline';
import { scoreMoveData } from '../src/lib/competition/moves';
import type { ScoringBaseline } from '../src/lib/finance/types';
import { isoDate, monthOf } from '../src/lib/finance/util';
import { MEMBERS } from '../src/lib/competition/demo';
import { publicScoreArgs } from '../src/lib/league/publish';

// ── Config ──────────────────────────────────────────────────────────────────

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnvFile('.env.local');

const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
const ME = arg('me') ?? 'maya';
const MAX_MOVES = Number(arg('moves') ?? Infinity);
const [MIN_S, MAX_S = MIN_S] = (arg('interval') ?? '10').split('-').map(Number);
const STDB_URI = (process.env.VITE_SPACETIMEDB_HOST || 'wss://maincloud.spacetimedb.com').replace(/^http/, 'ws');
const STDB_DB = process.env.VITE_SPACETIMEDB_DB || process.env.VITE_SPACETIMEDB_DB_NAME || 'fantasyfinance';
const TOKENS_FILE = 'scripts/.sim-tokens.json';
/** A move must change the score by at least this many points to be "visible". */
const VISIBLE = 0.3;

const apiKey = process.env.NESSIE_API_KEY;
if (!apiKey) {
  console.error('NESSIE_API_KEY is not set in .env.local.');
  process.exit(1);
}
const nessie = createNessieClient({
  baseUrl: process.env.NESSIE_BASE_URL || 'https://api.nessieisreal.com',
  apiKey,
});

const localToday = () => {
  const d = new Date();
  return isoDate(new Date(d.getTime() - d.getTimezoneOffset() * 60_000));
};
const clock = () => new Date().toLocaleTimeString();
const usd = (n: number) => `$${n}`;
const rand = (min: number, max: number) => Math.round(min + Math.random() * (max - min));
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

// ── Personalities ───────────────────────────────────────────────────────────

type Move =
  | { kind: 'purchase'; merchant: string; account: 'card' | 'chk'; min: number; max: number }
  | { kind: 'refund'; merchant: string; min: number; max: number }
  | { kind: 'save'; min: number; max: number }
  | { kind: 'withdrawSavings'; min: number; max: number }
  | { kind: 'invest'; min: number; max: number }
  | { kind: 'payBill' };

const buy = (merchant: string, min: number, max: number, account: 'card' | 'chk' = 'card'): Move => ({
  kind: 'purchase',
  merchant,
  account,
  min,
  max,
});
const ret = (merchant: string, min: number, max: number): Move => ({ kind: 'refund', merchant, min, max });

const DINING = [buy('DoorDash', 14, 32), buy('Chipotle', 9, 16), buy('Starbucks', 5, 9), buy("Torchy's Tacos", 10, 18)];
const NIGHTLIFE = [buy('Truck Yard Bar', 18, 48)];
const FUN = [buy('AMC Theatres', 12, 30), buy('Main Event Bowling', 20, 40), buy('Steam Games', 10, 40)];
const SHOPPING = [buy('Amazon', 15, 70), buy('Target', 15, 55, 'chk'), buy('Nike', 35, 90)];
// Returns/refunds win back category points after overspending.
const REFUNDS = [ret('Amazon', 15, 60), ret('Nike', 30, 80), ret('Truck Yard Bar', 15, 40), ret('DoorDash', 12, 30), ret('AMC Theatres', 12, 25)];
const SAVE: Move = { kind: 'save', min: 20, max: 90 };
const INVEST: Move = { kind: 'invest', min: 25, max: 80 };
const DIP: Move = { kind: 'withdrawSavings', min: 30, max: 90 };
const PAY: Move = { kind: 'payBill' };

/**
 * `moves`: [pool, weight] habits. `lean`: chance of choosing a move that raises
 * the score when both kinds are available.
 */
const PERSONALITY: Record<string, { style: string; lean: number; moves: Array<[Move[], number]> }> = {
  maya: { style: 'careful student', lean: 0.6, moves: [[DINING, 2], [FUN, 1], [[SAVE], 3], [REFUNDS, 1]] },
  jordan: { style: 'balanced', lean: 0.5, moves: [[DINING, 3], [NIGHTLIFE, 2], [SHOPPING, 2], [[SAVE], 3], [[INVEST], 2], [REFUNDS, 1]] },
  alex: { style: 'impulse shopper', lean: 0.35, moves: [[SHOPPING, 4], [DINING, 4], [FUN, 2], [[SAVE], 1], [REFUNDS, 2]] },
  sam: { style: 'super saver', lean: 0.8, moves: [[[SAVE], 5], [[INVEST], 3], [DINING, 2], [SHOPPING, 1], [REFUNDS, 2]] },
  riley: { style: 'night owl', lean: 0.3, moves: [[NIGHTLIFE, 5], [FUN, 3], [DINING, 2], [[DIP], 1], [[SAVE], 1], [REFUNDS, 2]] },
  avery: { style: 'steady', lean: 0.55, moves: [[DINING, 3], [SHOPPING, 2], [FUN, 2], [[SAVE], 2], [[INVEST], 1], [REFUNDS, 1]] },
};

const FORCED: Record<string, Move> = {
  dining: DINING[0],
  nightlife: NIGHTLIFE[0],
  fun: FUN[0],
  shopping: SHOPPING[0],
  refund: REFUNDS[0],
  save: SAVE,
  invest: INVEST,
  dip: DIP,
  payBill: PAY,
};
const FORCE = arg('move');

function pickWeighted(key: string): Move {
  const pools = (PERSONALITY[key] ?? PERSONALITY.avery).moves;
  let r = Math.random() * pools.reduce((s, [, w]) => s + w, 0);
  for (const [pool, w] of pools) if ((r -= w) <= 0) return pick(pool);
  return pools[0][0][0];
}

// ── Bots ────────────────────────────────────────────────────────────────────

type Bot = {
  key: string;
  name: string;
  customer: NessieCustomer;
  accounts: { chk?: NessieAccount; sav?: NessieAccount; card?: NessieAccount };
  conn: DbConnection;
  baseline?: ScoringBaseline;
  /** Last Nessie data fetched, used to try out moves before making one. */
  bundle?: NessieBundle;
  investingEligible: boolean;
  lastPct: number | null;
  joined: boolean;
  paused: boolean;
};

/** Is this bot's player currently controlled by someone else (e.g. you, in the browser)? */
function controlledElsewhere(bot: Bot) {
  const holders = [...bot.conn.db.leaguePlayer.iter()].filter(p => p.playerKey === `nessie:${bot.customer._id}`);
  const me = bot.conn.identity;
  return holders.length > 0 && !!me && !holders.some(h => h.owner.isEqual(me));
}

const tokens: Record<string, string> = existsSync(TOKENS_FILE) ? JSON.parse(readFileSync(TOKENS_FILE, 'utf8')) : {};
const saveTokens = () => writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));

/** Connect one bot with its own persistent identity and wait for its subscriptions. */
function connect(key: string): Promise<DbConnection> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`SpacetimeDB at ${STDB_URI} did not respond`)), 10_000);
    DbConnection.builder()
      .withUri(STDB_URI)
      .withDatabaseName(STDB_DB)
      .withToken(tokens[`${STDB_URI}/${STDB_DB}/${key}`])
      .onConnect((conn, _identity, token) => {
        tokens[`${STDB_URI}/${STDB_DB}/${key}`] = token; // identities are per server
        saveTokens();
        conn
          .subscriptionBuilder()
          .onApplied(() => {
            clearTimeout(timer);
            resolve(conn);
          })
          .subscribe([tables.myMonthState, tables.leaguePlayer]);
      })
      .onConnectError((_ctx, err) => {
        clearTimeout(timer);
        reject(err);
      })
      .build();
  });
}

let merchantByName = new Map<string, NessieMerchant>();

async function setupBot(spec: (typeof MEMBERS)[number], customers: NessieCustomer[]): Promise<Bot | null> {
  const customer = customers.find(c => c.first_name === spec.firstName && c.last_name === spec.lastName);
  if (!customer) {
    console.warn(`  ${spec.firstName} ${spec.lastName} isn't in Nessie — run: npx tsx scripts/seed-nessie.ts --execute --only=${spec.key}`);
    return null;
  }
  const accts = await nessie.get<NessieAccount[]>(`/customers/${customer._id}/accounts`);
  const conn = await connect(spec.key);
  return {
    key: spec.key,
    name: `${spec.firstName} ${spec.lastName}`,
    customer,
    accounts: {
      chk: accts.find(a => a.type === 'Checking'),
      sav: accts.find(a => a.type === 'Savings'),
      card: accts.find(a => a.type === 'Credit Card'),
    },
    conn,
    investingEligible: false,
    lastPct: null,
    joined: false,
    paused: false,
  };
}

const scoreOf = (bot: Bot, bundle: NessieBundle) =>
  scoreMoveData({
    data: nessieToProviderData(bundle, 'nessie'),
    asOf: localToday(),
    lockedBaseline: bot.baseline,
  }).score.efficiencyPct;

/** Re-read the bot's Nessie data, score it like the browser, publish to the league. */
async function rescore(bot: Bot) {
  const asOf = localToday();
  const month = monthOf(asOf);
  bot.bundle = await nessie.fetchBundle(bot.customer._id);
  const data = nessieToProviderData(bot.bundle, 'nessie');

  // Never take a member over from someone else; rejoin if it was released.
  if (controlledElsewhere(bot)) {
    bot.paused = true;
    return 'paused — someone else is playing this member';
  }
  const holder = [...bot.conn.db.leaguePlayer.iter()].find(p => p.playerKey === data.playerId);
  if (!holder) bot.joined = false;
  if (!bot.joined) {
    await bot.conn.reducers.joinLeague({ playerKey: data.playerId, displayName: data.displayName, source: data.source });
    bot.joined = true;
  }
  if (bot.baseline?.month !== month) {
    // Reuse a baseline this bot locked earlier (e.g. a previous run).
    const row = [...bot.conn.db.myMonthState.iter()].find(r => r.playerKey === data.playerId && r.month === month);
    bot.baseline = row ? (JSON.parse(row.baselineJson) as ScoringBaseline) : undefined;
  }

  const result = runFinancePipeline({ data, asOf, lockedBaseline: bot.baseline });
  if (!bot.baseline && result.baseline.status === 'locked') {
    bot.baseline = result.baseline;
    await bot.conn.reducers.lockBaseline({
      playerKey: data.playerId,
      month,
      baselineId: result.baseline.id,
      baselineJson: JSON.stringify(result.baseline),
      revisionReason: undefined,
    });
  }
  bot.investingEligible = !!result.baseline.investing.eligible;
  if (bot.baseline) await bot.conn.reducers.publishScore(publicScoreArgs(result.score));
  const pct = result.score.efficiencyPct;
  const delta =
    bot.lastPct === null || pct === null
      ? ''
      : ` (${pct >= bot.lastPct ? '▲' : '▼'}${Math.abs(pct - bot.lastPct).toFixed(1)})`;
  bot.lastPct = pct;
  return `${pct === null ? '—' : `${pct.toFixed(1)}%`}${delta}`;
}

// ── Moves ───────────────────────────────────────────────────────────────────

/** The Nessie record a move would create, added to a copy of the bundle (for trying it out). */
function withMove(bot: Bot, move: Move, amount: number): NessieBundle | null {
  const b = bot.bundle;
  const { chk, sav, card } = bot.accounts;
  if (!b) return null;
  const today = localToday();
  const id = `sim-${Math.random().toString(36).slice(2)}`;
  switch (move.kind) {
    case 'purchase': {
      const account = move.account === 'card' ? card ?? chk : chk;
      const merchant = merchantByName.get(move.merchant);
      if (!account || !merchant) return null;
      return {
        ...b,
        merchants: b.merchants.some(m => m._id === merchant._id) ? b.merchants : [...b.merchants, merchant],
        purchases: [
          ...b.purchases,
          {
            _id: id,
            type: 'merchant',
            merchant_id: merchant._id,
            payer_id: account._id,
            purchase_date: today,
            amount,
            status: 'completed',
            medium: 'balance',
            description: 'Card purchase',
          },
        ],
      };
    }
    case 'refund':
      if (!chk) return null;
      return {
        ...b,
        deposits: [
          ...b.deposits,
          {
            _id: id,
            type: 'deposit',
            payee_id: chk._id,
            transaction_date: today,
            amount,
            status: 'completed',
            medium: 'balance',
            description: `Refund: ${move.merchant} order`,
          },
        ],
      };
    case 'save':
    case 'withdrawSavings': {
      if (!chk || !sav) return null;
      const save = move.kind === 'save';
      return {
        ...b,
        transfers: [
          ...b.transfers,
          {
            _id: id,
            type: 'p2p',
            payer_id: save ? chk._id : sav._id,
            transaction_date: today,
            amount,
            status: 'completed',
            medium: 'balance',
            description: save ? 'Transfer to savings' : 'Transfer to checking',
          },
        ],
      };
    }
    case 'invest':
      if (!chk || !bot.investingEligible) return null;
      return {
        ...b,
        withdrawals: [
          ...b.withdrawals,
          {
            _id: id,
            type: 'withdrawal',
            payer_id: chk._id,
            transaction_date: today,
            amount,
            status: 'completed',
            medium: 'balance',
            description: 'Vanguard Roth IRA contribution',
          },
        ],
      };
    case 'payBill':
      return null; // no score effect to preview; only used when forced
  }
}

type Plan = { move: Move; amount: number; delta: number };

/**
 * Try several in-character moves against the bot's current data and choose one
 * that visibly changes its score, leaning up or down by personality.
 */
function planMove(bot: Bot): Plan | null {
  const base = bot.lastPct;
  if (base === null || !bot.bundle) return null;
  const tried: Plan[] = [];
  for (let i = 0; i < 16; i++) {
    const move = pickWeighted(bot.key);
    if (move.kind === 'payBill') continue;
    for (const scale of [1, 2.5]) {
      const amount = Math.max(1, Math.round(rand(move.min, move.max) * scale));
      const bundle = withMove(bot, move, amount);
      if (!bundle) break;
      const pct = scoreOf(bot, bundle);
      if (pct === null) break;
      tried.push({ move, amount, delta: pct - base });
      if (Math.abs(pct - base) >= VISIBLE) break; // no need to go bigger
    }
  }
  if (!tried.length) return null;
  const visible = tried.filter(p => Math.abs(p.delta) >= VISIBLE);
  if (!visible.length) return tried.reduce((a, b) => (Math.abs(b.delta) > Math.abs(a.delta) ? b : a));
  const wantUp = Math.random() < (PERSONALITY[bot.key] ?? PERSONALITY.avery).lean;
  const preferred = visible.filter(p => (wantUp ? p.delta > 0 : p.delta < 0));
  return pick(preferred.length ? preferred : visible);
}

/** Make the move for real in Nessie. Returns a description, or null if not possible. */
async function makeMove(bot: Bot, move: Move, amount: number): Promise<string | null> {
  const today = localToday();
  const { chk, sav, card } = bot.accounts;
  switch (move.kind) {
    case 'purchase': {
      const account = move.account === 'card' ? card ?? chk : chk;
      const merchant = merchantByName.get(move.merchant);
      if (!account || !merchant) return null;
      await nessie.post(`/accounts/${account._id}/purchases`, {
        merchant_id: merchant._id,
        medium: 'balance',
        purchase_date: today,
        amount,
        status: 'completed',
        description: 'Card purchase',
      });
      return `spent ${usd(amount)} at ${move.merchant}`;
    }
    case 'refund': {
      if (!chk) return null;
      await nessie.post(`/accounts/${chk._id}/deposits`, {
        medium: 'balance',
        transaction_date: today,
        status: 'completed',
        amount,
        description: `Refund: ${move.merchant} order`,
      });
      return `got a ${usd(amount)} refund from ${move.merchant}`;
    }
    case 'save': {
      if (!chk || !sav) return null;
      await nessie.post(`/accounts/${chk._id}/transfers`, {
        amount,
        transaction_date: today,
        status: 'completed',
        description: 'Transfer to savings',
      });
      return `moved ${usd(amount)} to savings`;
    }
    case 'withdrawSavings': {
      if (!chk || !sav) return null;
      await nessie.post(`/accounts/${sav._id}/transfers`, {
        amount,
        transaction_date: today,
        status: 'completed',
        description: 'Transfer to checking',
      });
      return `pulled ${usd(amount)} out of savings`;
    }
    case 'invest': {
      if (!chk || !bot.investingEligible) return null;
      await nessie.post(`/accounts/${chk._id}/withdrawals`, {
        medium: 'balance',
        transaction_date: today,
        status: 'completed',
        amount,
        description: 'Vanguard Roth IRA contribution',
      });
      return `invested ${usd(amount)} in a Roth IRA`;
    }
    case 'payBill': {
      if (!chk) return null;
      const month = monthOf(today);
      const bills = await nessie.get<NessieBill[]>(`/accounts/${chk._id}/bills`);
      const due = bills
        .filter(b => b.status === 'pending' && b.payment_date && monthOf(b.payment_date) === month)
        .sort((a, b) => (a.payment_date ?? '').localeCompare(b.payment_date ?? ''))[0];
      if (!due) return null;
      await nessie.put(`/bills/${due._id ?? (due as unknown as { id: string }).id}`, { status: 'completed' });
      return `paid ${due.nickname ?? due.payee} (${usd(due.payment_amount)}) early`;
    }
  }
}

// ── Main loop ───────────────────────────────────────────────────────────────

async function main() {
  const every = MIN_S === MAX_S ? `${MIN_S}` : `${MIN_S}–${MAX_S}`;
  console.log(`League simulator — SpacetimeDB ${STDB_URI}/${STDB_DB}, you are "${ME}", a move every ${every}s, bots take turns.`);
  const [customers, merchants] = await Promise.all([
    nessie.listCustomers(),
    nessie.get<NessieMerchant[]>('/merchants'),
  ]);
  merchantByName = new Map(merchants.map(m => [m.name, m]));

  const bots: Bot[] = [];
  for (const spec of MEMBERS.filter(m => m.key !== ME)) {
    const bot = await setupBot(spec, customers);
    if (!bot) continue;
    bots.push(bot);
    console.log(`  ${bot.name.padEnd(14)} ${(PERSONALITY[bot.key]?.style ?? '').padEnd(16)} ${await rescore(bot)}`);
  }
  if (!bots.length) throw new Error('No bots could be set up.');

  let moves = 0;
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    console.log(`\nStopping after ${moves} moves.`);
    for (const b of bots) b.conn.disconnect();
    setTimeout(() => process.exit(0), 300);
  };
  process.on('SIGINT', shutdown);

  // Fixed cadence: each turn starts one interval after the previous one
  // started, however long the Nessie round-trip took.
  let turn = 0;
  let next = Date.now();
  const schedule = () => {
    next += rand(MIN_S * 1000, MAX_S * 1000);
    setTimeout(tick, Math.max(0, next - Date.now()));
  };

  const tick = async () => {
    if (stopping) return;
    for (const b of bots) {
      const elsewhere = controlledElsewhere(b);
      if (elsewhere !== b.paused)
        console.log(`[${clock()}] ${b.name} ${elsewhere ? 'is being played by someone else — bot paused' : 'was released — bot resumes'}`);
      b.paused = elsewhere;
    }
    // Bots take turns in a fixed order so every player moves regularly.
    const active = bots.filter(b => !b.paused);
    const bot = active.length ? active[turn++ % active.length] : undefined;
    if (!bot) return schedule();
    try {
      const plan: Plan | null =
        FORCE && FORCED[FORCE]
          ? {
              move: FORCED[FORCE],
              amount: 'min' in FORCED[FORCE] ? rand(FORCED[FORCE].min, FORCED[FORCE].max) : 0,
              delta: 0,
            }
          : planMove(bot);
      const did = plan ? await makeMove(bot, plan.move, plan.amount) : null;
      if (did) {
        moves++;
        console.log(`[${clock()}] ${bot.name.padEnd(14)} ${did.padEnd(42)} → ${await rescore(bot)}`);
      } else {
        console.log(`[${clock()}] ${bot.name.padEnd(14)} sat this turn out (no possible move)`);
      }
    } catch (e) {
      console.warn(`[${clock()}] ${bot.name}: move failed — ${e instanceof Error ? e.message : e}`);
    }
    if (moves >= MAX_MOVES) return shutdown();
    schedule();
  };
  schedule();
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

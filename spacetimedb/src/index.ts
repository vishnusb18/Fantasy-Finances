import { schema, table, t, SenderError } from 'spacetimedb/server';

/**
 * Fantasy Finance backend.
 *
 * Nessie stays the source of truth for bank data (accounts, transactions,
 * bills); the browser fetches it and runs the deterministic scoring engine.
 * SpacetimeDB stores what must outlive a browser tab and be shared:
 *
 *  - private, per-identity player state: locked official baselines (lock rule
 *    enforced here), editable personal budgets, category corrections and
 *    confirmations — exposed to their owner only, through views;
 *  - public league data: display names and the public score summary each
 *    player publishes, so everyone connected sees one live league.
 *
 * `playerKey` is the finance player the browser is viewing (a Nessie customer
 * id or a sample persona). One SpacetimeDB identity may switch between them.
 *
 * Baselines and personal budgets are stored as serialized documents produced by
 * the (versioned) client engine; their shape is owned by src/lib/finance/types.
 */

const MONTH = /^\d{4}-\d{2}$/;
const MAX_DOC = 64_000;

// ── Public ──────────────────────────────────────────────────────────────────

const leaguePlayer = table(
  {
    name: 'league_player',
    public: true,
    indexes: [{ accessor: 'byOwnerPlayer', algorithm: 'btree', columns: ['owner', 'playerKey'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity(),
    playerKey: t.string(),
    displayName: t.string(),
    source: t.string(), // 'nessie' | 'seed'
    updatedAt: t.timestamp(),
  }
);

const CategoryResult = t.object('CategoryResult', {
  category: t.string(),
  eligible: t.bool(),
  earned: t.f64(),
  available: t.f64(),
});

const scoreSnapshot = table(
  {
    name: 'score_snapshot',
    public: true,
    indexes: [
      { accessor: 'byOwnerPlayerMonth', algorithm: 'btree', columns: ['owner', 'playerKey', 'month'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity(),
    playerKey: t.string(),
    month: t.string().index('btree'),
    scoringVersion: t.string(),
    status: t.string(), // 'provisional' | 'final'
    efficiencyPct: t.option(t.f64()),
    earnedPoints: t.f64(),
    availablePoints: t.f64(),
    // Public category adherence only — never amounts or transactions.
    categories: t.array(CategoryResult),
    updatedAt: t.timestamp(),
  }
);

const onlinePresence = table(
  { name: 'online_presence', public: true },
  {
    owner: t.identity().primaryKey(),
    connections: t.u32(),
    lastSeen: t.timestamp(),
  }
);

// ── Private (owner-only via views) ──────────────────────────────────────────

const monthState = table(
  {
    name: 'month_state',
    indexes: [
      { accessor: 'byOwnerPlayerMonth', algorithm: 'btree', columns: ['owner', 'playerKey', 'month'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity().index('btree'),
    playerKey: t.string(),
    month: t.string(),
    baselineId: t.string(),
    baselineJson: t.string(),
    baselineLockedAt: t.timestamp(),
    revisionReason: t.option(t.string()),
    personalBudgetJson: t.option(t.string()),
    updatedAt: t.timestamp(),
  }
);

const categoryOverride = table(
  {
    name: 'category_override',
    indexes: [{ accessor: 'byOwnerTx', algorithm: 'btree', columns: ['owner', 'transactionId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity().index('btree'),
    playerKey: t.string(),
    transactionId: t.string(),
    category: t.string(),
    correctedAt: t.timestamp(),
  }
);

const playerSettings = table(
  {
    name: 'player_settings',
    indexes: [{ accessor: 'byOwnerPlayer', algorithm: 'btree', columns: ['owner', 'playerKey'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity().index('btree'),
    playerKey: t.string(),
    confirmationsJson: t.string(),
    updatedAt: t.timestamp(),
  }
);

const spacetimedb = schema({
  leaguePlayer,
  scoreSnapshot,
  onlinePresence,
  monthState,
  categoryOverride,
  playerSettings,
});
export default spacetimedb;

// ── Validation ──────────────────────────────────────────────────────────────

function requireKey(playerKey: string) {
  if (!playerKey || playerKey.length > 128) throw new SenderError('Invalid player key.');
}
function requireMonth(month: string) {
  if (!MONTH.test(month)) throw new SenderError('Month must be YYYY-MM.');
}
function requireDoc(json: string, what: string) {
  if (json.length > MAX_DOC) throw new SenderError(`${what} is too large.`);
  try {
    JSON.parse(json);
  } catch {
    throw new SenderError(`${what} is not valid JSON.`);
  }
}

// ── Lifecycle: presence ─────────────────────────────────────────────────────

export const onConnect = spacetimedb.clientConnected(ctx => {
  const row = ctx.db.onlinePresence.owner.find(ctx.sender);
  if (row)
    ctx.db.onlinePresence.owner.update({
      ...row,
      connections: row.connections + 1,
      lastSeen: ctx.timestamp,
    });
  else ctx.db.onlinePresence.insert({ owner: ctx.sender, connections: 1, lastSeen: ctx.timestamp });
});

export const onDisconnect = spacetimedb.clientDisconnected(ctx => {
  const row = ctx.db.onlinePresence.owner.find(ctx.sender);
  if (!row) return;
  if (row.connections <= 1) ctx.db.onlinePresence.owner.delete(ctx.sender);
  else
    ctx.db.onlinePresence.owner.update({
      ...row,
      connections: row.connections - 1,
      lastSeen: ctx.timestamp,
    });
});

// ── Reducers ────────────────────────────────────────────────────────────────

/**
 * Play as a finance player. Each identity controls one player and each player
 * has one controller: joining releases the caller's previous player and takes
 * over this one (removing any other controller's published score for it).
 */
export const joinLeague = spacetimedb.reducer(
  { playerKey: t.string(), displayName: t.string(), source: t.string() },
  (ctx, { playerKey, displayName, source }) => {
    requireKey(playerKey);
    const name = displayName.trim().slice(0, 64) || 'Player';
    for (const p of [...ctx.db.leaguePlayer.iter()]) {
      const mine = p.owner.isEqual(ctx.sender);
      if ((mine && p.playerKey !== playerKey) || (!mine && p.playerKey === playerKey)) {
        ctx.db.leaguePlayer.id.delete(p.id);
        for (const s of [...ctx.db.scoreSnapshot.byOwnerPlayerMonth.filter([p.owner, p.playerKey])])
          ctx.db.scoreSnapshot.id.delete(s.id);
      }
    }
    const existing = [...ctx.db.leaguePlayer.byOwnerPlayer.filter([ctx.sender, playerKey])][0];
    if (existing) {
      if (existing.displayName === name && existing.source === source) return;
      ctx.db.leaguePlayer.id.update({ ...existing, displayName: name, source, updatedAt: ctx.timestamp });
    } else {
      ctx.db.leaguePlayer.insert({
        id: 0n,
        owner: ctx.sender,
        playerKey,
        displayName: name,
        source,
        updatedAt: ctx.timestamp,
      });
    }
  }
);

/**
 * Lock the official baseline for a month. The first lock wins; replacing it
 * requires an explicit revision reason (e.g. applied category corrections).
 */
export const lockBaseline = spacetimedb.reducer(
  {
    playerKey: t.string(),
    month: t.string(),
    baselineId: t.string(),
    baselineJson: t.string(),
    revisionReason: t.option(t.string()),
  },
  (ctx, { playerKey, month, baselineId, baselineJson, revisionReason }) => {
    requireKey(playerKey);
    requireMonth(month);
    requireDoc(baselineJson, 'Baseline');
    const existing = [...ctx.db.monthState.byOwnerPlayerMonth.filter([ctx.sender, playerKey, month])][0];
    if (!existing) {
      ctx.db.monthState.insert({
        id: 0n,
        owner: ctx.sender,
        playerKey,
        month,
        baselineId,
        baselineJson,
        baselineLockedAt: ctx.timestamp,
        revisionReason: undefined,
        personalBudgetJson: undefined,
        updatedAt: ctx.timestamp,
      });
      return;
    }
    if (existing.baselineId === baselineId) return; // idempotent re-lock
    const reason = revisionReason?.trim();
    if (!reason)
      throw new SenderError('The official baseline for this month is locked; a revision needs a reason.');
    ctx.db.monthState.id.update({
      ...existing,
      baselineId,
      baselineJson,
      baselineLockedAt: ctx.timestamp,
      revisionReason: reason.slice(0, 200),
      updatedAt: ctx.timestamp,
    });
  }
);

/** Save the editable personal budget. It never changes the official baseline. */
export const savePersonalBudget = spacetimedb.reducer(
  { playerKey: t.string(), month: t.string(), personalBudgetJson: t.string() },
  (ctx, { playerKey, month, personalBudgetJson }) => {
    requireKey(playerKey);
    requireMonth(month);
    requireDoc(personalBudgetJson, 'Personal budget');
    const existing = [...ctx.db.monthState.byOwnerPlayerMonth.filter([ctx.sender, playerKey, month])][0];
    if (!existing) throw new SenderError('Lock the official baseline before saving a personal budget.');
    ctx.db.monthState.id.update({ ...existing, personalBudgetJson, updatedAt: ctx.timestamp });
  }
);

/** Record a player's category correction (latest wins). */
export const setCategoryOverride = spacetimedb.reducer(
  { playerKey: t.string(), transactionId: t.string(), category: t.string() },
  (ctx, { playerKey, transactionId, category }) => {
    requireKey(playerKey);
    if (!transactionId || transactionId.length > 200) throw new SenderError('Invalid transaction id.');
    if (!/^[a-z_]{1,40}$/.test(category)) throw new SenderError('Invalid category.');
    const existing = [...ctx.db.categoryOverride.byOwnerTx.filter([ctx.sender, transactionId])].find(
      o => o.playerKey === playerKey
    );
    if (existing)
      ctx.db.categoryOverride.id.update({ ...existing, category, correctedAt: ctx.timestamp });
    else
      ctx.db.categoryOverride.insert({
        id: 0n,
        owner: ctx.sender,
        playerKey,
        transactionId,
        category,
        correctedAt: ctx.timestamp,
      });
  }
);

/** Save profile confirmations (extra obligations, income notes). */
export const saveConfirmations = spacetimedb.reducer(
  { playerKey: t.string(), confirmationsJson: t.string() },
  (ctx, { playerKey, confirmationsJson }) => {
    requireKey(playerKey);
    requireDoc(confirmationsJson, 'Confirmations');
    const existing = [...ctx.db.playerSettings.byOwnerPlayer.filter([ctx.sender, playerKey])][0];
    if (existing)
      ctx.db.playerSettings.id.update({ ...existing, confirmationsJson, updatedAt: ctx.timestamp });
    else
      ctx.db.playerSettings.insert({
        id: 0n,
        owner: ctx.sender,
        playerKey,
        confirmationsJson,
        updatedAt: ctx.timestamp,
      });
  }
);

/** Publish the public score summary for the league. */
export const publishScore = spacetimedb.reducer(
  {
    playerKey: t.string(),
    month: t.string(),
    scoringVersion: t.string(),
    status: t.string(),
    efficiencyPct: t.option(t.f64()),
    earnedPoints: t.f64(),
    availablePoints: t.f64(),
    categories: t.array(CategoryResult),
  },
  (ctx, args) => {
    requireKey(args.playerKey);
    requireMonth(args.month);
    if (args.status !== 'provisional' && args.status !== 'final') throw new SenderError('Invalid status.');
    const pct = args.efficiencyPct;
    if (pct !== undefined && (!Number.isFinite(pct) || pct < 0 || pct > 100))
      throw new SenderError('Efficiency must be between 0 and 100.');
    if (!(args.availablePoints >= 0 && args.earnedPoints >= 0 && args.earnedPoints <= args.availablePoints + 0.05))
      throw new SenderError('Points are out of range.');
    if (args.categories.length > 16) throw new SenderError('Too many categories.');
    if (![...ctx.db.leaguePlayer.byOwnerPlayer.filter([ctx.sender, args.playerKey])].length)
      throw new SenderError('Join the league as this player before publishing (another player may control it).');
    if (![...ctx.db.monthState.byOwnerPlayerMonth.filter([ctx.sender, args.playerKey, args.month])].length)
      throw new SenderError('Lock the official baseline before publishing a score.');

    const existing = [
      ...ctx.db.scoreSnapshot.byOwnerPlayerMonth.filter([ctx.sender, args.playerKey, args.month]),
    ][0];
    const row = {
      owner: ctx.sender,
      playerKey: args.playerKey,
      month: args.month,
      scoringVersion: args.scoringVersion.slice(0, 40),
      status: args.status,
      efficiencyPct: pct,
      earnedPoints: args.earnedPoints,
      availablePoints: args.availablePoints,
      categories: args.categories,
      updatedAt: ctx.timestamp,
    };
    if (existing) ctx.db.scoreSnapshot.id.update({ ...row, id: existing.id });
    else ctx.db.scoreSnapshot.insert({ ...row, id: 0n });
  }
);

/** Clear this identity's saved state for one finance player. */
export const resetPlayer = spacetimedb.reducer({ playerKey: t.string() }, (ctx, { playerKey }) => {
  requireKey(playerKey);
  for (const r of [...ctx.db.monthState.owner.filter(ctx.sender)])
    if (r.playerKey === playerKey) ctx.db.monthState.id.delete(r.id);
  for (const r of [...ctx.db.categoryOverride.owner.filter(ctx.sender)])
    if (r.playerKey === playerKey) ctx.db.categoryOverride.id.delete(r.id);
  for (const r of [...ctx.db.playerSettings.owner.filter(ctx.sender)])
    if (r.playerKey === playerKey) ctx.db.playerSettings.id.delete(r.id);
  for (const r of [...ctx.db.scoreSnapshot.byOwnerPlayerMonth.filter([ctx.sender, playerKey])])
    ctx.db.scoreSnapshot.id.delete(r.id);
});

// ── Owner-only views over private tables ────────────────────────────────────

export const myMonthState = spacetimedb.view(
  { name: 'my_month_state', public: true },
  t.array(monthState.rowType),
  ctx => [...ctx.db.monthState.owner.filter(ctx.sender)]
);

export const myCategoryOverride = spacetimedb.view(
  { name: 'my_category_override', public: true },
  t.array(categoryOverride.rowType),
  ctx => [...ctx.db.categoryOverride.owner.filter(ctx.sender)]
);

export const myPlayerSettings = spacetimedb.view(
  { name: 'my_player_settings', public: true },
  t.array(playerSettings.rowType),
  ctx => [...ctx.db.playerSettings.owner.filter(ctx.sender)]
);

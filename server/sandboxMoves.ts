import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";
import { openLeagueSession, LeagueSessionError } from "./leagueSession";
import {
  createNessieClient,
  NessieError,
  type NessieClient,
} from "../src/lib/finance/adapters/nessie/client";
import { nessieToProviderData } from "../src/lib/finance/adapters/nessie/toProviderData";
import type {
  NessieBundle,
  NessieMerchant,
} from "../src/lib/finance/adapters/nessie/types";
import { categorizePurchase } from "../src/lib/finance/categorize";
import type {
  CategoryOverride,
  PlayerConfirmations,
  ScoringBaseline,
  EfficiencyScoreSnapshot,
} from "../src/lib/finance/types";
import { MEMBERS } from "../src/lib/competition/demo";
import {
  moveSnapshot,
  simulateMove,
  scoreMoveData,
  MOVE_MERCHANTS,
  MoveError,
  type Move,
} from "../src/lib/competition/moves";
import { publicScoreArgs } from "../src/lib/league/publish";

type Request = {
  confirmed: true;
  operationId: string;
  customerId: string;
  month: string;
  fingerprint: string;
  move: Move;
};
export type MoveOwner = {
  identity: string;
  baseline: ScoringBaseline;
  overrides: CategoryOverride[];
  confirmations: PlayerConfirmations;
  owns: () => boolean;
  publish: (score: EfficiencyScoreSnapshot) => Promise<void>;
  close: () => void;
};
type Receipt = {
  operationId: string;
  efficiencyPct: number | null;
  earnedPoints: number;
  availablePoints: number;
};
export type JournalEntry = {
  id: string;
  player: string;
  owner: string;
  signature: string;
  status: "pending" | "written" | "done" | "rejected";
  receipt?: Receipt;
};
export type MoveJournal = {
  get: (id: string) => JournalEntry | undefined;
  all: () => JournalEntry[];
  set: (row: JournalEntry) => void;
};
export class SandboxError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "invalid",
  ) {
    super(message);
  }
}
const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
};

/** Synthetic seed footprint, not merely a name or a browser-supplied "sandbox" flag. */
export function seededSandbox(bundle: NessieBundle) {
  const spec = MEMBERS.find(
    (m) =>
      m.firstName === bundle.customer.first_name &&
      m.lastName === bundle.customer.last_name,
  );
  const a = bundle.customer.address;
  return (
    !!spec &&
    a?.street_number === "800" &&
    a.street_name === "W Campbell Rd" &&
    a.zip === "75080" &&
    spec.accounts.every((expected) =>
      bundle.accounts.some(
        (actual) =>
          actual.nickname === expected.nickname &&
          actual.type === expected.type &&
          actual.customer_id === bundle.customer._id,
      ),
    )
  );
}
function assertRequest(value: unknown): asserts value is Request {
  if (!value || typeof value !== "object")
    throw new SandboxError("Invalid move request.");
  const r = value as Request;
  if (r.confirmed !== true)
    throw new SandboxError("Explicit sandbox confirmation is required.");
  if (
    !/^[\w-]{16,80}$/.test(r.operationId ?? "") ||
    !/^[a-zA-Z0-9-]{1,100}$/.test(r.customerId ?? "") ||
    !/^\d{4}-\d{2}$/.test(r.month ?? "") ||
    typeof r.fingerprint !== "string" ||
    r.fingerprint.length > 100 ||
    !r.move ||
    !["spend", "save", "invest", "return", "bill"].includes(r.move.kind)
  )
    throw new SandboxError("Invalid move request.");
}

/** Reads, preview and validation happen before the single sandbox write. Replays only reconcile/publish. */
export function createMoveExecutor(deps: {
  nessie: NessieClient;
  authorize: (
    token: string,
    player: string,
    month: string,
  ) => Promise<MoveOwner>;
  journal: MoveJournal;
  date?: () => string;
}) {
  const busy = new Set<string>();
  return async (value: unknown, token: string) => {
    assertRequest(value);
    const request = value;
    if (!token || token.length > 8192)
      throw new SandboxError(
        "Reconnect to SpacetimeDB to confirm ownership.",
        401,
      );
    const asOf = (deps.date ?? today)();
    if (request.month !== asOf.slice(0, 7))
      throw new SandboxError(
        "Sandbox moves are only available in the active month.",
        409,
      );
    const player = `nessie:${request.customerId}`;
    const owner = await deps.authorize(token, player, request.month);
    try {
      if (
        owner.baseline.playerId !== player ||
        owner.baseline.month !== request.month ||
        owner.baseline.status !== "locked"
      )
        throw new SandboxError(
          "The official locked baseline is unavailable. Refresh before confirming.",
          409,
          "stale",
        );
      if (!owner.owns())
        throw new SandboxError("You no longer control this player.", 403);
      if (busy.has(player))
        throw new SandboxError(
          "A move is already in progress. Wait before retrying.",
          409,
        );
      busy.add(player);
      try {
        const signature = JSON.stringify({
          player,
          month: request.month,
          move: request.move,
        });
        let entry = deps.journal.get(request.operationId);
        if (
          entry &&
          (entry.signature !== signature || entry.owner !== owner.identity)
        )
          throw new SandboxError(
            "This confirmation id belongs to a different move.",
            409,
          );
        if (entry?.status === "done") return entry.receipt!;
        if (entry?.status === "rejected")
          throw new SandboxError(
            "That move was rejected. Preview a new move.",
            409,
          );
        if (
          deps.journal
            .all()
            .some(
              (e) =>
                e.player === player &&
                e.id !== request.operationId &&
                ["pending", "written"].includes(e.status),
            )
        )
          throw new SandboxError(
            "A previous move needs reconciliation before another can be submitted.",
            409,
            "reconcile",
          );
        let bundle = await deps.nessie.fetchBundle(request.customerId);
        if (!seededSandbox(bundle))
          throw new SandboxError(
            "Execution is limited to the application's seeded Nessie sandbox customers.",
            403,
          );
        const input = {
          data: nessieToProviderData(bundle, "nessie"),
          asOf,
          lockedBaseline: owner.baseline,
          overrides: owner.overrides,
          confirmations: owner.confirmations,
        };
        const marker = `[ff-move:${request.operationId}]`;
        const recorded = () =>
          nessieToProviderData(bundle, "nessie").transactions.some((t) =>
            t.description?.includes(marker),
          );
        if (!entry) {
          if (moveSnapshot(input) !== request.fingerprint)
            throw new SandboxError(
              "Your finances changed. Preview again before confirming.",
              409,
              "stale",
            );
          const preview = simulateMove(
            input,
            request.move,
            request.operationId,
          );
          if (preview.executionLimitation)
            throw new SandboxError(preview.executionLimitation);
          if (!owner.owns())
            throw new SandboxError("You no longer control this player.", 403);
          const raw = (id: string) => {
            const account = bundle.accounts.find(
              (a) =>
                `nessie:${a._id}` === id &&
                a.customer_id === request.customerId,
            );
            if (!account)
              throw new SandboxError(
                "The selected account is not owned by this customer.",
                403,
              );
            return account._id;
          };
          const account = raw(preview.transaction.accountId!);
          const body = {
            amount: preview.amountCents / 100,
            status: "completed",
            description: preview.transaction.description,
          };
          let path: string, payload: unknown;
          if (request.move.kind === "spend") {
            const category = request.move.category;
            const merchants =
              await deps.nessie.get<NessieMerchant[]>("/merchants");
            const merchant = merchants.find(
              (m) =>
                m.name === MOVE_MERCHANTS[category] &&
                categorizePurchase(
                  m.name,
                  Array.isArray(m.category) ? m.category : [m.category ?? ""],
                ).category === category,
            );
            if (!merchant)
              throw new SandboxError(
                "The seeded merchant for this category is unavailable; preview only.",
              );
            path = `/accounts/${account}/purchases`;
            payload = {
              ...body,
              purchase_date: asOf,
              merchant_id: merchant._id,
              medium: "balance",
            };
          } else if (request.move.kind === "save") {
            path = `/accounts/${account}/transfers`;
            payload = { ...body, transaction_date: asOf };
          } else if (
            request.move.kind === "invest" ||
            request.move.kind === "return"
          ) {
            path = `/accounts/${account}/${request.move.kind === "invest" ? "withdrawals" : "deposits"}`;
            payload = { ...body, transaction_date: asOf, medium: "balance" };
          } else throw new SandboxError("This action is preview-only.");
          // Persist reservation BEFORE sending. A crash/network timeout cannot silently repeat this write.
          entry = {
            id: request.operationId,
            player,
            owner: owner.identity,
            signature,
            status: "pending",
          };
          deps.journal.set(entry);
          if (!owner.owns()) {
            deps.journal.set({ ...entry, status: "rejected" });
            throw new SandboxError(
              "Player control changed; no move was sent.",
              403,
            );
          }
          try {
            await deps.nessie.post(path, payload);
          } catch (e) {
            if (
              e instanceof NessieError &&
              [400, 401, 403, 404, 422].includes(e.status)
            ) {
              deps.journal.set({ ...entry, status: "rejected" });
              throw new SandboxError(
                "Nessie rejected the move. No success was recorded.",
                e.status,
              );
            }
            throw new SandboxError(
              "Submission status is uncertain. Retry reconciliation; another transaction will not be sent.",
              503,
              "reconcile",
            );
          }
          entry = { ...entry, status: "written" };
          deps.journal.set(entry);
          bundle = await deps.nessie.fetchBundle(request.customerId);
        }
        if (!recorded())
          throw new SandboxError(
            "The move is not visible in Nessie yet. Retry reconciliation; no duplicate will be submitted.",
            503,
            "reconcile",
          );
        const actual = scoreMoveData({
          ...input,
          data: nessieToProviderData(bundle, "nessie"),
        });
        try {
          await owner.publish(actual.score);
        } catch {
          throw new SandboxError(
            "Move recorded in Nessie; live score sync is pending. Retry sync without repeating the move.",
            503,
            "reconcile",
          );
        }
        const receipt: Receipt = {
          operationId: request.operationId,
          efficiencyPct: actual.score.efficiencyPct,
          earnedPoints: actual.score.earnedPoints,
          availablePoints: actual.score.availablePoints,
        };
        deps.journal.set({ ...entry!, status: "done", receipt });
        return receipt;
      } catch (e) {
        const pending = deps.journal.get(request.operationId);
        if (
          pending &&
          pending.owner === owner.identity &&
          ["pending", "written"].includes(pending.status) &&
          !(e instanceof SandboxError && e.code === "reconcile")
        )
          throw new SandboxError(
            "A move may already be recorded. Retry reconciliation; no duplicate transaction will be sent.",
            503,
            "reconcile",
          );
        throw e;
      } finally {
        busy.delete(player);
      }
    } finally {
      owner.close();
    }
  };
}

function diskJournal(root: string): MoveJournal {
  const directory = join(root, ".sandbox-moves");
  const file = join(directory, "journal.json");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  // Fail closed on a corrupted journal, rather than forgetting possible submissions.
  const rows: Record<string, JournalEntry> = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf8"))
    : {};
  return {
    get: (id) => rows[id],
    all: () => Object.values(rows),
    set: (row) => {
      rows[row.id] = row;
      writeFileSync(`${file}.tmp`, JSON.stringify(rows), { mode: 0o600 });
      renameSync(`${file}.tmp`, file);
    },
  };
}
async function authorizeOwner(
  host: string,
  database: string,
  token: string,
  player: string,
  month: string,
): Promise<MoveOwner> {
  let session;
  try {
    session = await openLeagueSession(host, database, token, month, player);
  } catch (e) {
    throw new SandboxError(
      e instanceof LeagueSessionError
        ? e.message
        : "Unable to verify ownership.",
      e instanceof LeagueSessionError ? e.status : 403,
    );
  }
  if (!session.baseline || !session.controls()) {
    session.close();
    throw new SandboxError(
      "Connect and lock this player's official baseline before confirming.",
      403,
    );
  }
  return {
    identity: session.identity,
    baseline: session.baseline,
    overrides: session.overrides,
    confirmations: session.confirmations,
    owns: session.controls,
    close: session.close,
    publish: async (score) => {
      if (!session.controls()) throw new Error("Control changed");
      await session.connection.reducers.publishScore(publicScoreArgs(score));
    },
  };
}
export function sandboxMovesPlugin(env: Record<string, string>): Plugin {
  return {
    name: "fantasy-finance-sandbox-moves",
    configureServer(server) {
      let executor: ReturnType<typeof createMoveExecutor> | undefined;
      server.middlewares.use("/api/sandbox-moves", (req, res) => {
        const respond = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(body));
        };
        if (req.method !== "POST") {
          respond(405, { error: "Use POST to confirm a sandbox move." });
          return;
        }
        if (
          req.headers.origin &&
          new URL(req.headers.origin).host !== req.headers.host
        ) {
          respond(403, { error: "Same-origin requests only." });
          return;
        }
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
          if (body.length > 8192) req.destroy();
        });
        req.on("end", () => {
          void (async () => {
            try {
              const baseUrl =
                env.NESSIE_BASE_URL || "https://api.nessieisreal.com";
              if (
                !env.NESSIE_API_KEY ||
                new URL(baseUrl).origin !== "https://api.nessieisreal.com"
              )
                throw new SandboxError(
                  "Sandbox execution is unavailable on this server.",
                  503,
                );
              executor ??= createMoveExecutor({
                nessie: createNessieClient({
                  baseUrl,
                  apiKey: env.NESSIE_API_KEY,
                }),
                journal: diskJournal(server.config.root),
                authorize: (token, player, month) =>
                  authorizeOwner(
                    env.VITE_SPACETIMEDB_HOST ||
                      "wss://maincloud.spacetimedb.com",
                    env.VITE_SPACETIMEDB_DB ||
                      env.VITE_SPACETIMEDB_DB_NAME ||
                      "fantasyfinance",
                    token,
                    player,
                    month,
                  ),
              });
              const token =
                req.headers.authorization?.replace(/^Bearer /, "") ?? "";
              respond(200, await executor(JSON.parse(body), token));
            } catch (e) {
              const known = e instanceof SandboxError;
              respond(known ? e.status : e instanceof MoveError ? 400 : 503, {
                error:
                  known || e instanceof MoveError
                    ? e.message
                    : "Unable to complete the move. No success was recorded; retry reconciliation if submitted.",
                code: known ? e.code : "error",
              });
            }
          })();
        });
      });
    },
  };
}

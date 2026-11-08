import { afterEach, describe, expect, it, vi } from "vitest";
import { DbConnection } from "../src/module_bindings";
import { openLeagueSession } from "../server/leagueSession";

afterEach(() => vi.restoreAllMocks());

/** Exercise the actual authorization gate without connecting to or writing the live league. */
function transport(ownsPlayer: boolean) {
  const identity = { toHexString: () => "verified-owner" };
  const player = {
    playerKey: "nessie:owner-customer",
    displayName: "Owner",
    source: "nessie",
    owner: { isEqual: (other: unknown) => ownsPlayer && other === identity },
  };
  const disconnect = vi.fn();
  let applied: () => void;
  const subscription = {
    onError: () => subscription,
    onApplied: (fn: () => void) => {
      applied = fn;
      return subscription;
    },
    subscribe: () => queueMicrotask(() => applied()),
  };
  const conn = {
    isActive: true,
    disconnect,
    db: {
      leaguePlayer: { iter: () => [player] },
      // A caller can create its own baseline row; it must never grant ownership.
      myMonthState: {
        iter: () => [
          { playerKey: player.playerKey, month: "2026-11", baselineJson: "{}" },
        ],
      },
      myPlayerSettings: { iter: () => [] },
      myCategoryOverride: { iter: () => [] },
      scoreSnapshot: { iter: () => [] },
    },
    subscriptionBuilder: () => subscription,
  };
  let connected: (connection: unknown, principal: unknown) => void;
  const builder = {
    withUri: () => builder,
    withDatabaseName: () => builder,
    withToken: () => builder,
    onConnect: (fn: typeof connected) => {
      connected = fn;
      return builder;
    },
    onConnectError: () => builder,
    build: () => {
      queueMicrotask(() => connected(conn, identity));
      return conn;
    },
  };
  vi.spyOn(DbConnection, "builder").mockReturnValue(
    builder as unknown as ReturnType<typeof DbConnection.builder>,
  );
  return { conn, disconnect, player };
}

describe("SpacetimeDB coach session ownership", () => {
  it("rejects missing credentials before opening a connection", async () => {
    const builder = vi.spyOn(DbConnection, "builder");
    await expect(
      openLeagueSession("ws://test", "test", "", "2026-11"),
    ).rejects.toMatchObject({ status: 401 });
    expect(builder).not.toHaveBeenCalled();
  });
  it("does not treat an owner-only baseline as ownership of another player's banking data", async () => {
    const { disconnect } = transport(false);
    await expect(
      openLeagueSession("ws://test", "test", "test-token", "2026-11"),
    ).rejects.toMatchObject({ status: 403 });
    expect(disconnect).toHaveBeenCalledOnce();
  });
  it("rejects a client-selected player different from the authenticated owner", async () => {
    const { disconnect } = transport(true);
    await expect(
      openLeagueSession(
        "ws://test",
        "test",
        "test-token",
        "2026-11",
        "nessie:other-customer",
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(disconnect).toHaveBeenCalledOnce();
  });
  it("uses the server-authenticated player and tracks loss of the connection", async () => {
    const { conn, disconnect } = transport(true);
    const session = await openLeagueSession(
      "ws://test",
      "test",
      "test-token",
      "2026-11",
    );
    expect(session.playerKey).toBe("nessie:owner-customer");
    expect(session.identity).toBe("verified-owner");
    expect(session.controls()).toBe(true);
    conn.isActive = false;
    expect(session.controls()).toBe(false);
    session.close();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});

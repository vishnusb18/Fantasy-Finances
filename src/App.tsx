import { BudgetSection } from "./app/BudgetSection";
import { ProfileSection } from "./app/ProfileSection";
import { ScoreSection } from "./app/ScoreSection";
import { TransactionsSection } from "./app/TransactionsSection";
import { useFinance } from "./app/useFinance";
import { Chip } from "./app/ui";
import { MEMBERS as PERSONAS } from "./lib/competition/demo";
import { useState } from "react";
import { Competition } from "./app/Competition";

export default function App() {
  const f = useFinance();
  const [tab, setTab] = useState("Matchup");
  const src = f.source;
  const sampleSpec =
    src.kind === "sample"
      ? PERSONAS.find((p) => p.key === src.persona)
      : undefined;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            ◆
          </span>
          <div>
            <h1>Fantasy Finance</h1>
            <p className="sub">
              Monthly efficiency, measured against your own realistic plan.
            </p>
          </div>
        </div>

        <div className="source">
          <div className="seg" role="tablist" aria-label="Data source">
            <button
              role="tab"
              aria-selected={f.source.kind === "nessie"}
              className={f.source.kind === "nessie" ? "on" : ""}
              onClick={() =>
                f.setSource({
                  kind: "nessie",
                  customerId: f.customers?.[0]?._id ?? "",
                })
              }
            >
              Nessie (live)
            </button>
            <button
              role="tab"
              aria-selected={f.source.kind === "sample"}
              className={f.source.kind === "sample" ? "on" : ""}
              onClick={() =>
                f.setSource({ kind: "sample", persona: PERSONAS[0].key })
              }
            >
              Offline sample
            </button>
          </div>

          {f.source.kind === "nessie" && __NESSIE_CONFIGURED__ && (
            <select
              aria-label="Nessie customer"
              value={f.source.customerId}
              onChange={(e) =>
                f.setSource({ kind: "nessie", customerId: e.target.value })
              }
            >
              {!f.customers && <option>Loading customers…</option>}
              {f.customers?.length === 0 && (
                <option value="">No customers — run npm run seed:nessie</option>
              )}
              {f.customers?.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.first_name} {c.last_name}
                </option>
              ))}
            </select>
          )}
          {f.source.kind === "sample" && (
            <select
              aria-label="Sample player"
              value={f.source.persona}
              onChange={(e) =>
                f.setSource({ kind: "sample", persona: e.target.value })
              }
            >
              {PERSONAS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.firstName} {p.lastName}
                </option>
              ))}
            </select>
          )}
          {f.data && (
            <button
              className="link"
              onClick={f.resetPlayer}
              title="Clear corrections, goals and the locked baseline for this player"
            >
              Reset player
            </button>
          )}
        </div>
      </header>

      <nav className="main-nav" aria-label="Main navigation">
        {["Matchup", "League", "Reports", "My Finances"].map((name, i) => (
          <button
            key={name}
            aria-current={tab === name ? "page" : undefined}
            className={tab === name ? "active" : ""}
            onClick={() => setTab(name)}
          >
            <span aria-hidden>{["◈", "♜", "▥", "◎"][i]}</span>
            {name}
          </button>
        ))}
      </nav>
      {tab !== "My Finances" && (
        <Competition f={f} tab={tab} onFinances={() => setTab("My Finances")} />
      )}
      {tab === "My Finances" && (
        <>
          {sampleSpec && (
            <p className="banner">
              <Chip tone="info">Sample data in Nessie format</Chip>{" "}
              {sampleSpec.blurb}
            </p>
          )}

          {f.source.kind === "nessie" && !__NESSIE_CONFIGURED__ && (
            <div className="card setup">
              <h2>Connect Nessie</h2>
              <ol>
                <li>
                  Add <code>NESSIE_API_KEY=…</code> to <code>.env.local</code>{" "}
                  (see <code>.env.example</code>). No <code>VITE_</code> prefix
                  — the dev server adds the key, so it never reaches the
                  browser.
                </li>
                <li>
                  Seed demo customers: <code>npm run seed:nessie</code> (dry
                  run), then <code>npm run seed:nessie -- --execute</code>.
                </li>
                <li>
                  Restart <code>npm run dev</code>.
                </li>
              </ol>
              <p className="hint">
                Until then, use the offline sample — same Nessie shapes, same
                adapter.
              </p>
            </div>
          )}

          {f.error && <div className="card error">{f.error}</div>}
          {f.loading && (
            <div className="card loading">Loading accounts from Nessie…</div>
          )}

          {f.result && (
            <main className="grid">
              <div className="col">
                <ScoreSection f={f} />
                <BudgetSection f={f} />
              </div>
              <div className="col">
                <ProfileSection f={f} />
              </div>
              <div className="full">
                <TransactionsSection f={f} />
              </div>
            </main>
          )}
        </>
      )}
      <footer className="footer">
        Educational prototype for HackUTD 2026. Budget splits are an
        illustrative policy, not financial advice.
      </footer>
    </div>
  );
}

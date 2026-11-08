import { useFinance } from "./app/useFinance";
import { MEMBERS as PERSONAS } from "./lib/competition/demo";
import { useEffect, useState } from "react";
import { FinancePage } from "./app/FinancePage";
import { Competition } from "./app/Competition";

export default function App() {
  const f = useFinance();
  const [tab, setTab] = useState("Matchup");
  useEffect(() => {
    window.scrollTo(0, 0);
    const sidebar = document.querySelector(".sidebar");
    if (sidebar) sidebar.scrollTop = 0;
  }, [tab]);
  const src = f.source;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        {" "}
        <div className="brand">
          <span className="logo brand-logo" aria-hidden>
            <img
              src="/images/brand-logo.png"
              alt=""
              width={1536}
              height={1024}
            />
          </span>
          <div>
            <h1>Fantasy Finance</h1>
          </div>
        </div>
        <div className="sidebar-league">
          <p className="eyebrow">LEAGUE</p>
          <h2>
            {src.kind === "sample"
              ? "The Campus Collective"
              : "Your financial profile"}
          </h2>
          <p>
            {src.kind === "sample"
              ? "6 managers · Sample"
              : "Nessie live accounts"}
          </p>
        </div>
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
      </aside>
      <div className="app">
        <header className="topbar">
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
                  <option value="">
                    No customers — run npm run seed:nessie
                  </option>
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

        {tab !== "My Finances" && (
          <Competition
            f={f}
            tab={tab}
            onFinances={() => setTab("My Finances")}
          />
        )}
        {tab === "My Finances" && <FinancePage f={f} />}
      </div>
    </div>
  );
}

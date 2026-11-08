import { useFinance } from "./app/useFinance";
import { MEMBERS as PERSONAS } from "./lib/competition/demo";
import { useEffect, useState } from "react";
import { FinancePage } from "./app/FinancePage";
import { Competition } from "./app/Competition";
import { CloudStatusPill, LiveLeague } from "./app/LiveLeague";
import { useLiveLeague } from "./app/useLiveLeague";
import { FloatingShinyDrifblim } from "./app/coach/FloatingShinyDrifblim";

export default function App({ entered = true }: { entered?: boolean }) {
  const f = useFinance();
  const live = useLiveLeague(
    f.source.kind === "nessie" && __NESSIE_CONFIGURED__,
  );
  const [tab, setTab] = useState("Matchup");
  const [reportMonth, setReportMonth] = useState("");
  const [coachMonth, setCoachMonth] = useState(f.month);
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
          <h2>The Campus Collective</h2>
          <p>
            {src.kind === "sample"
              ? "6 managers · Sample"
              : `${live.members.length} managers · Live`}
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
        <FloatingShinyDrifblim
          ready={entered}
          scope={{
            month: coachMonth,
            source: src.kind,
            playerKey:
              src.kind === "nessie"
                ? `nessie:${src.customerId}`
                : `seed:${src.persona}-cust`,
            connected: f.cloudStatus === "ready",
          }}
        />
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
            <CloudStatusPill status={f.cloudStatus} error={f.cloudError} />
          </div>
        </header>

        {tab !== "My Finances" && (
          <Competition
            f={f}
            live={live}
            tab={tab}
            onFinances={() => setTab("My Finances")}
            selectedReportMonth={reportMonth}
            onReportMonthChange={setReportMonth}
            onVisibleMonthChange={setCoachMonth}
          />
        )}
        {tab === "League" && f.source.kind === "nessie" && (
          <LiveLeague month={f.month} />
        )}
        {tab === "My Finances" && (
          <FinancePage f={f} onVisibleMonthChange={setCoachMonth} />
        )}
      </div>
    </div>
  );
}

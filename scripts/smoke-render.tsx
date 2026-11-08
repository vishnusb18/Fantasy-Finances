// Dev smoke test: render every UI section to HTML with real pipeline output.
(globalThis as any).__NESSIE_CONFIGURED__ = false;
import { renderToString } from "react-dom/server";
import { nessieToProviderData } from "../src/lib/finance/adapters/nessie/toProviderData";
import {
  createPersonalBudget,
  generateBudgetBaseline,
} from "../src/lib/finance/baseline";
import { generatePersonaBundle } from "../src/lib/finance/demo/personas";
import { MEMBERS as PERSONAS } from "../src/lib/competition/demo";
import { Competition } from "../src/app/Competition";
import { runFinancePipeline } from "../src/lib/finance/pipeline";
import { DEFAULT_POLICY } from "../src/lib/finance/policy";
import { ProfileSection } from "../src/app/ProfileSection";
import { BudgetSection } from "../src/app/BudgetSection";
import { ScoreSection } from "../src/app/ScoreSection";
import { TransactionsSection } from "../src/app/TransactionsSection";
import type { FinanceState } from "../src/app/useFinance";

const asOf = "2026-11-07";
for (const spec of PERSONAS) {
  const data = nessieToProviderData(generatePersonaBundle(spec, asOf), "seed");
  const result = runFinancePipeline({ data, asOf });
  const f = {
    asOf,
    month: "2026-11",
    source: { kind: "sample", persona: spec.key },
    customers: null,
    data,
    loading: false,
    error: null,
    result,
    personal: createPersonalBudget(result.baseline),
    confirmations: {},
    overrides: [],
    correctionsChangeBaseline: true,
    proposed: generateBudgetBaseline(result.profile, DEFAULT_POLICY, {
      previous: result.baseline,
    }),
    recategorize() {},
    updateConfirmations() {},
    applyCorrectionsToBaseline() {},
    editPersonal() {},
    resetPlayer() {},
    setSource() {},
  } as unknown as FinanceState;
  for (const [name, C] of Object.entries({
    ProfileSection,
    BudgetSection,
    ScoreSection,
    TransactionsSection,
  })) {
    const html = renderToString(<C f={f} />);
    console.log(
      spec.key.padEnd(7),
      name.padEnd(20),
      `${html.length} chars`,
      html.includes("NaN") || html.includes("undefined")
        ? "⚠ contains NaN/undefined"
        : "ok",
    );
  }
  for (const tab of ["Matchup", "League", "Reports"]) {
    const html = renderToString(
      <Competition f={f} tab={tab} onFinances={() => {}} />,
    );
    if (html.includes("NaN") || html.includes("undefined"))
      throw new Error(`${spec.key} ${tab} invalid output`);
    console.log(spec.key.padEnd(7), tab.padEnd(20), `${html.length} chars ok`);
  }
}

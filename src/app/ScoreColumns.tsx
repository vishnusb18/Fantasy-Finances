import { useId } from "react";
import type { ComponentKey, ComponentScore } from "../lib/finance/types";
import { round1 } from "../lib/finance/util";

const labels: Record<ComponentKey, [string, string]> = {
  spending: ["Discretionary spending", "Spend"],
  savings: ["Savings progress", "Save"],
  bills: ["Bills & debt", "Bills"],
  investing: ["Investing consistency", "Invest"],
  optimization: ["Financial optimization", "Optim."],
};

/** The existing earned/available bars, presented vertically on the same 0–100% scale. */
export function ScoreColumns({
  components,
}: {
  components: Record<ComponentKey, ComponentScore>;
}) {
  const id = useId();
  return (
    <div
      className="score-column-chart"
      role="group"
      aria-label="Financial category completion, 0 to 100 percent"
    >
      <div className="score-column-scale" aria-hidden="true">
        <span>100%</span>
        <span>50%</span>
        <span>0%</span>
      </div>
      <div className="score-columns">
        {(Object.keys(labels) as ComponentKey[]).map((key) => {
          const c = components[key];
          const eligible = c.eligible && c.available > 0;
          const ratio = eligible
            ? Math.min(100, Math.max(0, (c.earned / c.available) * 100))
            : 0;
          const detail = eligible
            ? `${labels[key][0]}: ${round1(c.earned)} / ${round1(c.available)} points · ${round1(ratio)}%`
            : `${labels[key][0]}: Not scored. ${c.explanations[0] ?? ""}`;
          return (
            <div
              className={`score-column ${eligible ? "" : "ineligible"}`}
              key={key}
            >
              <div className="score-column-value numeric" aria-hidden="true">
                {eligible ? (
                  <>
                    {round1(c.earned)} <small>/ {round1(c.available)}</small>
                  </>
                ) : (
                  "—"
                )}
              </div>
              <button
                type="button"
                className="score-column-plot"
                aria-label={labels[key][0]}
                aria-describedby={`${id}-${key}`}
              >
                {eligible && ratio > 0 && (
                  <span
                    className="score-column-fill"
                    style={{ height: `${ratio}%` }}
                  />
                )}
                {!eligible && (
                  <span className="column-unscored" aria-hidden="true">
                    —
                  </span>
                )}
              </button>
              <span className="score-column-label" aria-hidden="true">
                <span className="column-full-label">{labels[key][0]}</span>
                <span className="column-short-label">{labels[key][1]}</span>
              </span>
              <span
                className="column-tooltip"
                role="tooltip"
                id={`${id}-${key}`}
              >
                {detail}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

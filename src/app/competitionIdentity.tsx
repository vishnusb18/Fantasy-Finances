import { MEMBERS } from "../lib/competition/demo";
import { categoryLabel } from "../lib/finance/scoring";
export const playerName = (id: string) => {
  const p = MEMBERS.find((p) => p.key === id)!;
  return `${p.firstName} ${p.lastName}`;
};
export const teamName = (id: string) =>
  [
    "The Compounders",
    "Cashflow Kings",
    "Margin Makers",
    "Steady Climbers",
    "The Rainy Days",
    "Future Fund",
  ][MEMBERS.findIndex((p) => p.key === id)];
export const positionLabel = (key: string) =>
  ({ bills: "Bills & debt", savings: "Savings", investing: "Investing" })[
    key
  ] ?? categoryLabel(key);
export function Avatar({ id }: { id: string }) {
  return (
    <span className="avatar">
      {playerName(id)
        .split(" ")
        .map((n) => n[0])
        .join("")}
    </span>
  );
}

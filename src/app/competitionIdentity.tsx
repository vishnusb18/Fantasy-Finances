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
const playerAnimals: Record<string, string> = {
  maya: "fox",
  jordan: "deer",
  alex: "chicken",
  sam: "bear",
  riley: "cow",
  avery: "giraffe",
};
export function Avatar({ id }: { id: string }) {
  const animal = playerAnimals[id] ?? "fox";
  return (
    <span
      className="avatar animal-avatar"
      role="img"
      aria-label={`${animal} avatar`}
    >
      <img
        src={`/images/avatars/${animal}.svg`}
        alt=""
        width={24}
        height={24}
        draggable={false}
      />
    </span>
  );
}

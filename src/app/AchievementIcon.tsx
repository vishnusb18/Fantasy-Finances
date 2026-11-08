/* Original 16px-grid achievement sprites, rendered as crisp SVG pixels. */
const sprites = {
  trophy: [
    "................",
    "...DDDDDDDDDD...",
    "...DLLLLLLLLD...",
    ".DDDGGGGGGGGDDD.",
    ".DLDSGGGGGGLDLD.",
    ".DGDSSGGGGGLDGD.",
    ".DGDSSGGGGGLDGD.",
    "..DDSSGGGGGLDD..",
    "...DDSSGGGLDD...",
    "....DDSSGLDD....",
    ".....DDLLDD.....",
    "......DGGD......",
    "......DGGD......",
    "....DDDLLDDD....",
    "....DGGGGGGD....",
    "....DDDDDDDD....",
  ],
  medal: [
    "..DDDD....DDDD..",
    "..DPPD....DPPD..",
    "..DPPDD..DDPPD..",
    "...DPPDDDDPPD...",
    "...DPPPLLLPPD...",
    "....DDLLLLDD....",
    "....DDDDDDDD....",
    "...DDLLLLLLDD...",
    "..DDLGGGGGGLDD..",
    "..DLGGGLLGGGLD..",
    "..DLGLLLLLLGLD..",
    "..DLGGGLLGGGLD..",
    "..DDLGGLLGGLDD..",
    "...DDSSSSSSDD...",
    "....DDDDDDDD....",
    "................",
  ],
  savings: [
    "................",
    "......DDDD......",
    ".....DLLLLD.....",
    "....DDGLLGDD....",
    "....DDDDDDDD....",
    ".....DGGGGD.....",
    "....DDGLLGDD....",
    "...DDGLLLLGDD...",
    "..DDGGGLLGGGDD..",
    "..DLGGLLLLGGLD..",
    "..DLGGGLLGGGLD..",
    "..DLGLLLLGGGLD..",
    "..DDGGGLLGGGDD..",
    "...DDSSSSSSDD...",
    "....DDDDDDDD....",
    "................",
  ],
  shield: [
    "................",
    "..DDDDDDDDDDDD..",
    "..DLLLLLLLLLLD..",
    "..DLGGGGGGGGLD..",
    "..DLGGGGGLGGLD..",
    "..DLGGGGLLGGLD..",
    "..DLGLGLLGGGLD..",
    "..DLGLLLGGGGLD..",
    "..DLGGLLGGGGLD..",
    "...DLGGGGGGLD...",
    "...DDGGGGGGDD...",
    "....DDGGGGDD....",
    ".....DDSSDD.....",
    "......DDDD......",
    ".......DD.......",
    "................",
  ],
  flame: [
    ".......DD.......",
    "......DLD.......",
    ".....DLLD.......",
    "....DLLLDD......",
    "....DLLLGD......",
    "..DDDLLLGDD.....",
    "..DLLLLLGGDD....",
    ".DLLLLLGGGGDD...",
    ".DLLLLGGLLGGD...",
    ".DLLLGGLLLGGD...",
    ".DLLGGLLLLGGD...",
    "..DGGLLLLLGGD...",
    "..DDGLLLLGGDD...",
    "...DDSSSSGDD....",
    "....DDDDDDD.....",
    "................",
  ],
  hourglass: [
    "................",
    "...DDDDDDDDDD...",
    "...DLLLLLLLLD...",
    "....DPPPPPDD....",
    "....DLGGGLDD....",
    ".....DLGLDD.....",
    "......DLLD......",
    "......DGGD......",
    "......DGGD......",
    ".....DDGLDD.....",
    "....DDGGGLDD....",
    "....DLGGGGLD....",
    "....DGGGGGGD....",
    "...DLLLLLLLLD...",
    "...DDDDDDDDDD...",
    "................",
  ],
};
const palette: Record<string, string> = {
  D: "#130b22",
  P: "#8d6ab4",
  G: "#f4c45b",
  L: "#fff0b3",
  S: "#b67d32",
};
const awardSprites: Record<string, keyof typeof sprites> = {
  "Most efficient manager": "trophy",
  "Lowest efficiency": "medal",
  "Savings MVP": "savings",
  "Spending discipline": "shield",
  "Biggest improvement": "flame",
  "Points left on the bench": "hourglass",
};
export function AchievementIcon({ title }: { title: string }) {
  const kind = awardSprites[title] ?? "trophy";
  return (
    <svg
      className="achievement-icon"
      data-achievement={kind}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      shapeRendering="crispEdges"
    >
      {sprites[kind].flatMap((row, y) =>
        [...row].flatMap((pixel, x) =>
          palette[pixel]
            ? [
                <rect
                  key={`${x}-${y}`}
                  x={x}
                  y={y}
                  width="1"
                  height="1"
                  fill={palette[pixel]}
                />,
              ]
            : [],
        ),
      )}
    </svg>
  );
}

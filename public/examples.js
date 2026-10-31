export const EXAMPLES = [
  { id: "idle7", amount: "100", days: "7", from: "idle" },
  { id: "rock1", amount: "100", days: "1", from: "rock" },
  { id: "sharp30", amount: "1000", days: "30", from: "sharp" },
  { id: "apc30", amount: "100", days: "30", from: "apc" },
];

const FROM = {
  en: { idle: "Idle USDC", rock: "RockawayX", sharp: "SharpByte", apc: "Axil Prime 3M" },
  pt: { idle: "USDC parado", rock: "RockawayX", sharp: "SharpByte", apc: "Axil Prime 3M" },
};

export function buttonLabel(row, lang) {
  const place = FROM[lang === "pt" ? "pt" : "en"][row.from];
  if (lang === "pt") return `${row.amount} USDC, ${row.days} dias, ${place}`;
  return `${row.amount} USDC, ${row.days} days, ${place}`;
}

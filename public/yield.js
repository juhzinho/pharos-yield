const FROM = ["idle", "rock", "sharp", "prime"];
const WAD = 10n ** 18n;
const DAYS_YEAR = 365n;

export const TEXT = {
  en: {
    badAmount: "The amount is not a USDC amount.",
    zero: "The amount is zero.",
    badDays: "The holding period is not a number of days from 1 to 365.",
    badFrom: "The current place is not one of the three vaults or idle USDC.",
    unread: "Three yield sources could not be read.",
    noGas: "A recent deposit or withdraw was not found, so gas was not measured.",
    fromUnread: "The vault you are in could not be read.",
    already: "Already in the highest net vault.",
    skip: (net, cost, days) => `Net ${net} USDC over ${days} days is not above the cost of ${cost} USDC.`,
    go: (net, cost, days) => `Net ${net} USDC over ${days} days is above the cost of ${cost} USDC. The unsigned calls are ready. Nothing was broadcast.`,
    headStay: "Stay put.",
    headGo: "Prepare the move.",
  },
  pt: {
    badAmount: "A quantidade não é um valor em USDC.",
    zero: "A quantidade é zero.",
    badDays: "O prazo não é um número de dias de 1 a 365.",
    badFrom: "O lugar atual não é um dos três vaults nem USDC parado.",
    unread: "Três fontes de rendimento não puderam ser lidas.",
    noGas: "Não há um depósito ou saque recente, então o gás não foi medido.",
    fromUnread: "O vault em que você está não pôde ser lido.",
    already: "Já está no vault de maior líquido.",
    skip: (net, cost, days) => `O líquido de ${net} USDC em ${days} dias não está acima do custo de ${cost} USDC.`,
    go: (net, cost, days) => `O líquido de ${net} USDC em ${days} dias está acima do custo de ${cost} USDC. As chamadas sem assinatura estão prontas. Nada foi enviado.`,
    headStay: "Ficar onde está.",
    headGo: "Preparar a troca.",
  },
};

function parseUnits(text, decimals) {
  const raw = String(text ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) return null;
  const [whole, frac = ""] = raw.split(".");
  if (frac.length > decimals) return null;
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || 0);
}

function formatUnits(value, decimals, places = decimals) {
  const neg = value < 0n;
  const raw = neg ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const frac = (raw % base).toString().padStart(decimals, "0").slice(0, places);
  const out = places === 0 ? whole.toString() : `${whole}.${frac}`;
  return neg ? `-${out}` : out;
}

export function parseForm({ amount, days, from }) {
  const amount6 = parseUnits(amount, 6);
  if (amount6 === null || amount6 === 0n) return null;
  const rawDays = String(days ?? "").trim();
  if (!/^\d+$/.test(rawDays)) return null;
  const hold = Number(rawDays);
  if (hold < 1 || hold > 365) return null;
  if (!FROM.includes(from)) return null;
  return { amount6, days: hold, from };
}

export function money(value) {
  return formatUnits(value, 6, 6);
}

export function pct(wad) {
  return formatUnits(wad * 100n, 18, 4);
}

export function holdGain(amount6, srcApy, destApy, days) {
  const extra = destApy - srcApy;
  if (extra <= 0n) return 0n;
  return (amount6 * extra * BigInt(days)) / (DAYS_YEAR * WAD);
}

function reject(t, reason) {
  return { ok: false, headline: reason, reason, executed: false, broadcast: false };
}

export function evaluate({ amount, days, from, sources, gasUsdc6, lang = "en" }) {
  const t = TEXT[lang === "pt" ? "pt" : "en"];
  const parsed = parseForm({ amount, days, from });
  if (!parsed) {
    if (parseUnits(amount, 6) === null) return reject(t, t.badAmount);
    if (parseUnits(amount, 6) === 0n) return reject(t, t.zero);
    if (!FROM.includes(from)) return reject(t, t.badFrom);
    return reject(t, t.badDays);
  }
  if (parsed.amount6 === 0n) return reject(t, t.zero);
  const live = Array.isArray(sources) ? sources.filter((row) => row && row.ok) : [];
  if (live.length < 3) return reject(t, t.unread);

  const current =
    parsed.from === "idle"
      ? { id: "idle", name: "USDC", netApyWad: 0n, entry6: 0n, exit6: 0n, ok: true }
      : live.find((row) => row.id === parsed.from);
  if (!current) return reject(t, t.fromUnread);

  const rows = live.map((row) => ({
    id: row.id,
    name: row.name,
    protocol: row.protocol,
    symbol: row.symbol,
    gross: pct(row.grossApyWad ?? row.netApyWad),
    net: pct(row.netApyWad),
    fee: pct(row.feeWad ?? 0n),
    entry: money(row.entry6),
    exit: money(row.exit6),
  }));

  const base = {
    ok: true,
    executed: false,
    broadcast: false,
    amount: money(parsed.amount6),
    days: parsed.days,
    from: parsed.from,
    sources: rows,
    pick: null,
    txs: null,
  };

  if (gasUsdc6 === null || gasUsdc6 === undefined) {
    return { ...base, decision: "stay", headline: t.headStay, reason: t.noGas };
  }

  const higher = live.filter((dest) => dest.id !== current.id && dest.netApyWad > current.netApyWad);
  if (!higher.length) {
    return { ...base, decision: "stay", headline: t.headStay, reason: t.already };
  }

  let best = null;
  let considered = 0;
  for (const dest of higher) {
    const gas = dest.gas6 ?? gasUsdc6;
    if (gas === null || gas === undefined) continue;
    considered += 1;
    const gain = holdGain(parsed.amount6, current.netApyWad, dest.netApyWad, parsed.days);
    const cost = current.exit6 + dest.entry6 + gas;
    const net = gain - cost;
    const card = {
      id: dest.id,
      name: dest.name,
      gain: money(gain),
      cost: money(cost),
      net: money(net),
      entry: money(dest.entry6),
      exit: money(current.exit6),
      gas: money(gas),
      netRaw: net,
    };
    if (!best || net > best.netRaw) best = card;
  }

  if (considered === 0 || !best) {
    return { ...base, decision: "stay", headline: t.headStay, reason: t.noGas };
  }

  if (best.netRaw <= 0n) {
    return {
      ...base,
      decision: "stay",
      headline: t.headStay,
      reason: t.skip(best.net, best.cost, parsed.days),
      pick: { ...best, netRaw: undefined },
    };
  }

  return {
    ...base,
    decision: "prepare",
    headline: t.headGo,
    reason: t.go(best.net, best.cost, parsed.days),
    pick: { ...best, netRaw: undefined },
  };
}

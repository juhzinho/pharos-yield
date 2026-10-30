import { buttonLabel, EXAMPLES } from "./examples.js";
import { parseForm } from "./yield.js";

const KEY = "pharos-yield-log";
const $ = (id) => document.getElementById(id);
const copy = {
  en: {
    kicker: "Yield",
    title: "Stay put, or move.",
    lead: "Three USDC vaults are read on Pacific. The extra yield over your holding period has to cover gas, the exit of where you are, and the entry of where you would go. If it does not, the answer is stay put.",
    sources: "RockawayX and SharpByte are Morpho vaults. Prime is TermMax. Each net rate comes from that vault, after its own fee.",
    hold: "The days are the holding period. A higher rate is not enough on its own.",
    keys: "If a move is worth it, the calls stay unsigned. Nothing is broadcast.",
    amount: "USDC amount",
    days: "Holding days",
    from: "Currently in",
    idle: "Idle USDC",
    rock: "RockawayX USDC",
    sharp: "SharpByte USDC",
    prime: "Pharos Prime",
    go: "Compare",
    reading: "Reading the vaults…",
    failed: "The vaults could not be read.",
    history: "Stored compares",
    empty: "No compares are stored yet.",
    vaults: "Live vaults",
    pick: "Move",
    stay: "Stay",
    gain: "Expected extra",
    cost: "Cost",
    gas: "Gas",
    entry: "Entry",
    exit: "Exit",
    net: "Net",
    light: "Light",
    dark: "Dark",
  },
  pt: {
    kicker: "Rendimento",
    title: "Ficar, ou mover.",
    lead: "Três vaults de USDC são lidos na Pacific. O rendimento extra no seu prazo tem que cobrir o gás, a saída de onde você está e a entrada de para onde iria. Se não cobrir, a resposta é ficar.",
    sources: "RockawayX e SharpByte são vaults da Morpho. Prime é TermMax. Cada taxa líquida vem daquele vault, depois da taxa dele.",
    hold: "Os dias são o prazo mínimo. Uma taxa maior sozinha não basta.",
    keys: "Se a troca valer, as chamadas ficam sem assinatura. Nada é enviado.",
    amount: "Quantidade em USDC",
    days: "Dias de prazo",
    from: "Onde está agora",
    idle: "USDC parado",
    rock: "RockawayX USDC",
    sharp: "SharpByte USDC",
    prime: "Pharos Prime",
    go: "Comparar",
    reading: "Lendo os vaults…",
    failed: "Os vaults não puderam ser lidos.",
    history: "Comparações guardadas",
    empty: "Ainda não há comparações guardadas.",
    vaults: "Vaults lidos",
    pick: "Mover",
    stay: "Ficar",
    gain: "Extra esperado",
    cost: "Custo",
    gas: "Gás",
    entry: "Entrada",
    exit: "Saída",
    net: "Líquido",
    light: "Claro",
    dark: "Escuro",
  },
};

let lang = localStorage.getItem("pharos-yield-lang") === "pt" ? "pt" : "en";
let theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
let current = null;

function t() {
  return copy[lang];
}

function form() {
  return { amount: $("amount").value, days: $("days").value, from: $("from").value };
}

function loadLog() {
  try {
    const rows = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(rows) ? rows.slice(0, 20) : [];
  } catch {
    return [];
  }
}

function saveLog(row) {
  const next = [row, ...loadLog().filter((item) => item.at !== row.at)].slice(0, 20);
  localStorage.setItem(KEY, JSON.stringify(next));
}

function applyTheme() {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("pharos-yield-theme", theme);
  for (const button of document.querySelectorAll(".theme [data-theme]")) {
    button.textContent = button.dataset.theme === "dark" ? t().dark : t().light;
    button.classList.toggle("on", button.dataset.theme === theme);
  }
}

function place(id) {
  return t()[id] || id;
}

function show(data) {
  current = data;
  const text = t();
  const box = document.createElement("article");
  if (!data.ok) {
    box.className = "card stay";
    const reason = document.createElement("p");
    reason.textContent = data.reason || text.failed;
    box.append(reason);
    $("out").replaceChildren(box);
    return;
  }
  box.className = `card ${data.decision}`;
  const title = document.createElement("b");
  title.textContent = data.headline;
  const reason = document.createElement("p");
  reason.textContent = data.reason;
  box.append(title, reason);
  if (data.pick) {
    const line = document.createElement("p");
    line.className = "detail";
    line.textContent = `${text.pick}: ${data.pick.name}. ${text.gain} ${data.pick.gain} USDC. ${text.cost} ${data.pick.cost} USDC. ${text.gas} ${data.pick.gas} USDC.`;
    box.append(line);
  }
  if (Array.isArray(data.sources) && data.sources.length) {
    const label = document.createElement("p");
    label.className = "log-label";
    label.textContent = text.vaults;
    box.append(label);
    for (const row of data.sources) {
      const item = document.createElement("article");
      item.className = ["check", data.pick && data.pick.id === row.id ? "pick" : ""].filter(Boolean).join(" ");
      const name = document.createElement("strong");
      name.textContent = `${row.name} · ${row.net}%`;
      const meta = document.createElement("span");
      meta.textContent = `${row.protocol} · ${text.entry} ${row.entry} · ${text.exit} ${row.exit}`;
      const flag = document.createElement("em");
      flag.textContent = data.pick && data.pick.id === row.id ? text.pick : data.from === row.id ? text.stay : "";
      item.append(name, meta, flag);
      box.append(item);
    }
  }
  if (data.txs) {
    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(data.txs, null, 2);
    box.append(pre);
  }
  $("out").replaceChildren(box);
}

function renderLog() {
  const text = t();
  const rows = loadLog();
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "detail";
    empty.textContent = text.empty;
    $("history").replaceChildren(empty);
    return;
  }
  $("history").replaceChildren(...rows.map((row) => {
    const item = document.createElement("article");
    item.className = "check";
    const title = document.createElement("strong");
    title.textContent = `${row.headline} · ${row.amount} USDC · ${row.days}d`;
    const meta = document.createElement("span");
    meta.textContent = `${place(row.from)} · ${row.at}`;
    const flag = document.createElement("em");
    flag.textContent = row.decision === "prepare" ? text.pick : text.stay;
    item.append(title, meta, flag);
    return item;
  }));
}

function paint() {
  const text = t();
  $("kicker").textContent = text.kicker;
  $("title").textContent = text.title;
  $("lead").textContent = text.lead;
  $("rules").textContent = [text.sources, text.hold, text.keys].join(" ");
  $("amountL").textContent = text.amount;
  $("daysL").textContent = text.days;
  $("fromL").textContent = text.from;
  $("from").options[0].textContent = text.idle;
  $("from").options[1].textContent = text.rock;
  $("from").options[2].textContent = text.sharp;
  $("from").options[3].textContent = text.prime;
  $("go").textContent = text.go;
  $("logLabel").textContent = text.history;
  document.documentElement.lang = lang;
  applyTheme();
  for (const button of document.querySelectorAll(".lang button")) button.classList.toggle("on", button.dataset.lang === lang);
  const now = form();
  $("chips").replaceChildren(...EXAMPLES.map((row) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.ex = row.id;
    button.textContent = buttonLabel(row, lang);
    button.classList.toggle("on", now.amount.trim() === row.amount && now.days.trim() === row.days && now.from === row.from);
    return button;
  }));
  if (current) show(current);
  renderLog();
}

$("chips").addEventListener("click", (event) => {
  const button = event.target.closest("[data-ex]");
  if (!button) return;
  const row = EXAMPLES.find((item) => item.id === button.dataset.ex);
  $("amount").value = row.amount;
  $("days").value = row.days;
  $("from").value = row.from;
  paint();
});

for (const button of document.querySelectorAll(".theme [data-theme]")) {
  button.addEventListener("click", () => {
    theme = button.dataset.theme === "dark" ? "dark" : "light";
    applyTheme();
  });
}

for (const button of document.querySelectorAll(".lang button")) {
  button.addEventListener("click", () => {
    lang = button.dataset.lang;
    localStorage.setItem("pharos-yield-lang", lang);
    paint();
  });
}

$("amount").addEventListener("input", () => paint());
$("days").addEventListener("input", () => paint());
$("from").addEventListener("change", () => paint());

$("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const currentForm = form();
  if (!parseForm(currentForm)) {
    current = { ok: false, reason: lang === "pt" ? "A quantidade, os dias ou o lugar atual não estão certos." : "The amount, the days or the current place is not valid." };
    paint();
    return;
  }
  $("go").disabled = true;
  $("status").textContent = t().reading;
  try {
    const res = await fetch("/api/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...currentForm, lang }),
    });
    const data = await res.json();
    show(data);
    if (data.ok) {
      saveLog({
        headline: data.headline,
        decision: data.decision,
        amount: data.amount,
        days: data.days,
        from: data.from,
        at: new Date().toISOString().slice(0, 19).replace("T", " ") + " UTC",
      });
      renderLog();
      $("status").textContent = "";
    } else {
      $("status").textContent = data.reason || t().failed;
    }
  } catch {
    $("status").textContent = t().failed;
  } finally {
    $("go").disabled = false;
  }
});

paint();

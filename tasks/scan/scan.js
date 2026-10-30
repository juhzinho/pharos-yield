import { scanRequest } from "../../lib/scan.js";

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const lang = arg("--lang") === "pt" ? "pt" : "en";
const out = await scanRequest({
  amount: arg("--amount", "100"),
  days: arg("--days", "7"),
  from: arg("--from", "idle"),
  lang,
});
console.log(out.headline || out.reason);
if (out.ok) {
  console.log(out.reason);
  for (const row of out.sources ?? []) {
    console.log(`${row.name}  net ${row.net}%  entry ${row.entry}  exit ${row.exit}`);
  }
  if (out.pick) console.log(`${out.decision} ${out.pick.name}  net ${out.pick.net} USDC`);
  if (out.txs) console.log(`${out.txs.length} unsigned calls`);
}
process.exit(0);

import { measureMoveGas, nextNonce, readMarket } from "./chain.js";
import { encodeApprove, encodeCall, encodeDeposit, encodeWithdraw } from "./encode.js";
import { CHAIN_ID, SAMPLE, USDC, VAULTS } from "./vaults.js";
import { TEXT, evaluate, parseForm } from "../public/yield.js";

function limitOf(used) {
  return (used * 12n) / 10n;
}

function buildTxs({ from, amount6, pick, market, nonce }) {
  const dest = VAULTS.find((row) => row.id === pick.id);
  const src = from === "idle" ? null : VAULTS.find((row) => row.id === from);
  if (!dest || market.approveGas === null || market.depositGas === null) return null;
  if (src && market.withdrawGas === null) return null;
  const txs = [];
  let next = nonce;
  if (src) {
    txs.push(
      encodeCall(src.address, encodeWithdraw(amount6, SAMPLE, SAMPLE), {
        from: SAMPLE,
        nonce: next,
        gas: limitOf(market.withdrawGas),
        gasPrice: market.gasPrice,
        chainId: CHAIN_ID,
      }),
    );
    next += 1n;
  }
  txs.push(
    encodeCall(USDC, encodeApprove(dest.address, amount6), {
      from: SAMPLE,
      nonce: next,
      gas: limitOf(market.approveGas),
      gasPrice: market.gasPrice,
      chainId: CHAIN_ID,
    }),
  );
  next += 1n;
  txs.push(
    encodeCall(dest.address, encodeDeposit(amount6, SAMPLE), {
      from: SAMPLE,
      nonce: next,
      gas: limitOf(market.depositGas),
      gasPrice: market.gasPrice,
      chainId: CHAIN_ID,
    }),
  );
  return txs;
}

export async function scanRequest({ amount, days, from, lang = "en" }) {
  const t = TEXT[lang === "pt" ? "pt" : "en"];
  const parsed = parseForm({ amount, days, from });
  if (!parsed) return evaluate({ amount, days, from, sources: [], gasUsdc6: 0n, lang });
  try {
    const market = await readMarket(parsed.amount6, parsed.from);
    const preview = evaluate({
      amount,
      days,
      from,
      sources: market.sources,
      gasUsdc6: 0n,
      lang,
    });
    if (!preview.ok) return { ...preview, block: market.block };
    if (preview.decision !== "prepare") {
      return { ...preview, block: market.block, txs: null };
    }
    const gas = await measureMoveGas({
      fromId: parsed.from,
      destId: preview.pick.id,
      amount6: parsed.amount6,
      market,
    });
    const out = evaluate({
      amount,
      days,
      from,
      sources: market.sources,
      gasUsdc6: gas.gasUsdc6,
      lang,
    });
    if (!out.ok) return { ...out, block: market.block };
    if (out.decision !== "prepare") {
      return { ...out, block: market.block, txs: null };
    }
    market.approveGas = gas.approveGas;
    market.depositGas = gas.depositGas;
    market.withdrawGas = gas.withdrawGas;
    const nonce = await nextNonce();
    const txs = buildTxs({ from: parsed.from, amount6: parsed.amount6, pick: out.pick, market, nonce });
    if (!txs) {
      return {
        ...out,
        decision: "stay",
        headline: t.headStay,
        reason: t.noGas,
        pick: out.pick,
        txs: null,
        block: market.block,
      };
    }
    return { ...out, txs, block: market.block };
  } catch {
    return { ok: false, headline: t.unread, reason: t.unread, executed: false, broadcast: false };
  }
}

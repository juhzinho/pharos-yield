import { encodeApprove } from "./encode.js";
import { hex } from "./format.js";
import { CHAIN_ID, IRM, MORPHO, POOL, RPC, SAMPLE, USDC, VAULTS, WAD, WPROS, YEAR, TERM_RATE } from "./vaults.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function rpc(method, params, attempt = 0) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await res.json();
  if (body.error) {
    const message = body.error.message || "rpc";
    if (attempt < 3 && /too fast|cu limit|rate/i.test(message)) {
      await sleep(700 * (attempt + 1));
      return rpc(method, params, attempt + 1);
    }
    throw new Error(message);
  }
  return body.result;
}

function word(value, index = 0) {
  return BigInt(`0x${value.slice(2 + index * 64, 2 + (index + 1) * 64)}`);
}

function addressOf(value) {
  return `0x${value.slice(26, 66).toLowerCase()}`;
}

function pad32(value) {
  return BigInt(value).toString(16).padStart(64, "0");
}

async function call(to, data, tag = "latest") {
  await sleep(80);
  return rpc("eth_call", [{ to, data }, tag]);
}

function spotUsdc6(sqrtPriceX96) {
  const sqrt = BigInt(sqrtPriceX96);
  return (sqrt * sqrt * 10n ** 18n) / 2n ** 192n;
}

function apyFromPerSecond(rateWad) {
  const x = (Number(rateWad) * Number(YEAR)) / 1e18;
  if (!Number.isFinite(x) || x <= 0) return 0n;
  const apy = Math.exp(x) - 1;
  if (!Number.isFinite(apy) || apy <= 0) return 0n;
  return BigInt(Math.floor(apy * 1e18));
}

function lossOf(amount6, back) {
  return amount6 > back ? amount6 - back : 0n;
}

async function previewCosts(address, amount6) {
  const shares = word(await call(address, `0xef8b30f7${pad32(amount6)}`));
  const back = word(await call(address, `0x4cdad506${pad32(shares)}`));
  const value = word(await call(address, `0x07a2d13a${pad32(shares)}`));
  const entry = lossOf(amount6, value);
  const exit = lossOf(value, back);
  return { entry6: entry, exit6: exit };
}

async function morphoApy(vault) {
  const feeWad = word(await call(vault.address, "0x87788782"));
  const maxRate = word(await call(vault.address, "0xece1d6e5"));
  const length = word(await call(vault.adapter, "0xace48b45"));
  if (length === 0n) throw new Error("no markets");
  let weight = 0n;
  let acc = 0n;
  for (let i = 0n; i < length; i++) {
    const id = (await call(vault.adapter, `0x779a9683${pad32(i)}`)).slice(2);
    const expected = word(await call(vault.adapter, `0x99f7e861${id}`));
    const paramsHex = await call(MORPHO, `0x2c3c9157${id}`);
    const marketHex = await call(MORPHO, `0x5c60e39a${id}`);
    const params = [0, 1, 2, 3, 4].map((index) => pad32(word(paramsHex, index)));
    const market = [0, 1, 2, 3, 4, 5].map((index) => pad32(word(marketHex, index)));
    const rate = word(await call(IRM, `0x8c00bf6b${params.join("")}${market.join("")}`));
    const supply = word(marketHex, 0);
    const borrow = word(marketHex, 2);
    const marketFee = word(marketHex, 5);
    const util = supply === 0n ? 0n : (borrow * WAD) / supply;
    const supplyRate = (((rate * util) / WAD) * (WAD - marketFee)) / WAD;
    weight += expected;
    acc += expected * supplyRate;
  }
  const blended = weight === 0n ? 0n : acc / weight;
  const capped = blended > maxRate ? maxRate : blended;
  const grossApyWad = apyFromPerSecond(capped);
  const netApyWad = (grossApyWad * (WAD - feeWad)) / WAD;
  return { grossApyWad, netApyWad, feeWad };
}

async function termmaxApy(address) {
  const gross = word(await call(address, "0x3bcfc4b8"));
  const fee = word(await call(address, "0x0ffbfda4"));
  const grossApyWad = (gross * WAD) / TERM_RATE;
  const netApyWad = (grossApyWad * (TERM_RATE - fee)) / TERM_RATE;
  return { grossApyWad, netApyWad, feeWad: (fee * WAD) / TERM_RATE };
}

export async function readVault(vault, amount6, tag) {
  const asset = addressOf(await call(vault.address, "0x38d52e0f", tag));
  if (asset !== USDC) throw new Error("asset");
  const rates = vault.kind === "morpho" ? await morphoApy(vault) : await termmaxApy(vault.address);
  const costs = await previewCosts(vault.address, amount6);
  return {
    id: vault.id,
    name: vault.name,
    protocol: vault.protocol,
    symbol: vault.symbol,
    address: vault.address,
    ok: true,
    ...rates,
    ...costs,
  };
}

async function hintBlock(address, head, now, secPer1000) {
  try {
    const last = word(await call(address, "0xc0463711"));
    if (last === 0n || secPer1000 === 0n) return null;
    const dt = now > last ? now - last : 0n;
    return head - (dt * 1000n) / secPer1000;
  } catch {
    return null;
  }
}

async function recentGas(address, head, now, secPer1000) {
  const hint = (await hintBlock(address, head, now, secPer1000)) ?? head;
  const ranges = [];
  const add = (to) => {
    if (to <= 0n) return;
    const end = to > head ? head : to;
    const from = end > 999n ? end - 999n : 0n;
    ranges.push([from, end]);
  };
  add(hint);
  for (let i = 1; i <= 20; i++) {
    add(hint + BigInt(i) * 1000n);
    add(hint - BigInt(i) * 1000n);
  }
  add(head);
  const seen = new Set();
  for (const [from, to] of ranges) {
    await sleep(80);
    let logs = [];
    try {
      logs = await rpc("eth_getLogs", [{ address, fromBlock: hex(from), toBlock: hex(to) }]);
    } catch {
      continue;
    }
    for (const log of logs.reverse()) {
      const hash = log.transactionHash;
      if (seen.has(hash)) continue;
      seen.add(hash);
      await sleep(80);
      const receipt = await rpc("eth_getTransactionReceipt", [hash]);
      if (receipt?.status === "0x1" && receipt.gasUsed) return BigInt(receipt.gasUsed);
    }
  }
  return null;
}

export async function readMarket(amount6, fromId) {
  const block = BigInt(await rpc("eth_blockNumber", []));
  const tag = hex(block);
  await sleep(80);
  const header = await rpc("eth_getBlockByNumber", [tag, false]);
  await sleep(80);
  const earlier = await rpc("eth_getBlockByNumber", [hex(block > 1000n ? block - 1000n : 0n), false]);
  const now = BigInt(header.timestamp);
  const secPer1000 = now - BigInt(earlier.timestamp);
  await sleep(80);
  const gasPrice = BigInt(await rpc("eth_gasPrice", []));
  await sleep(80);
  const slot0 = await rpc("eth_call", [{ to: POOL, data: "0x3850c7bd" }, tag]);
  await sleep(80);
  const token0 = addressOf(await rpc("eth_call", [{ to: POOL, data: "0x0dfe1681" }, tag]));
  await sleep(80);
  const token1 = addressOf(await rpc("eth_call", [{ to: POOL, data: "0xd21220a7" }, tag]));
  await sleep(80);
  const fee = word(await rpc("eth_call", [{ to: POOL, data: "0xddca3f43" }, tag]));
  if (token0 !== WPROS || token1 !== USDC || fee !== 100n) throw new Error("pool");
  const spot = spotUsdc6(word(slot0, 0));

  const sources = [];
  for (const vault of VAULTS) {
    try {
      sources.push(await readVault(vault, amount6, tag));
    } catch {
      sources.push({ id: vault.id, name: vault.name, protocol: vault.protocol, symbol: vault.symbol, address: vault.address, ok: false });
    }
  }

  return {
    block: block.toString(),
    at: new Date(Number(BigInt(header.timestamp)) * 1000).toISOString(),
    chainId: CHAIN_ID,
    gasPrice,
    spot,
    now,
    secPer1000,
    sources,
  };
}

export async function measureMoveGas({ fromId, destId, amount6, market }) {
  const dest = VAULTS.find((row) => row.id === destId);
  const src = fromId === "idle" ? null : VAULTS.find((row) => row.id === fromId);
  if (!dest) return { gasUsdc6: null, approveGas: null, depositGas: null, withdrawGas: 0n };
  let approveGas = null;
  try {
    approveGas = BigInt(
      await rpc("eth_estimateGas", [{ from: SAMPLE, to: USDC, data: encodeApprove(dest.address, amount6) }]),
    );
  } catch {
    approveGas = null;
  }
  const head = BigInt(market.block);
  const depositGas = await recentGas(dest.address, head, market.now, market.secPer1000);
  const withdrawGas = src ? await recentGas(src.address, head, market.now, market.secPer1000) : 0n;
  if (approveGas === null || depositGas === null || withdrawGas === null) {
    return { gasUsdc6: null, approveGas, depositGas, withdrawGas };
  }
  const units = withdrawGas + depositGas + approveGas;
  return {
    gasUsdc6: (units * market.gasPrice * market.spot) / 10n ** 18n,
    approveGas,
    depositGas,
    withdrawGas,
  };
}

export async function nextNonce() {
  await sleep(80);
  return BigInt(await rpc("eth_getTransactionCount", [SAMPLE, "latest"]));
}

export { SAMPLE, CHAIN_ID, USDC };

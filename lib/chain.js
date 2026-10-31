import { encodeApprove } from "./encode.js";
import { hex } from "./format.js";
import { CHAIN_ID, IRM, MORPHO, POOL, RPC, SAMPLE, USDC, VAULTS, WAD, WPROS, YEAR, TERM_RATE } from "./vaults.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function rpcOne(method, params, attempt = 0) {
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
      return rpcOne(method, params, attempt + 1);
    }
    throw new Error(message);
  }
  return body.result;
}

async function rpcMany(calls, attempt = 0) {
  if (!calls.length) return [];
  if (calls.length === 1) return [await rpcOne(calls[0].method, calls[0].params)];
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(calls.map((call, index) => ({ jsonrpc: "2.0", id: index + 1, method: call.method, params: call.params }))),
  });
  const body = await res.json();
  const rows = Array.isArray(body) ? body : body ? [body] : [];
  const limited = rows.find((row) => row?.error && /too fast|cu limit|rate/i.test(row.error.message || ""));
  if (limited && attempt < 3) {
    await sleep(700 * (attempt + 1));
    return rpcMany(calls, attempt + 1);
  }
  if (!Array.isArray(body)) {
    const out = [];
    for (const call of calls) out.push(await rpcOne(call.method, call.params));
    return out;
  }
  const byId = new Map(body.map((row) => [Number(row.id), row]));
  return calls.map((call, index) => {
    const row = byId.get(index + 1);
    if (!row) throw new Error("rpc");
    if (row.error) throw new Error(row.error.message || "rpc");
    return row.result;
  });
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

function callSpec(to, data, tag = "latest") {
  return { method: "eth_call", params: [{ to, data }, tag] };
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
  const [sharesHex] = await rpcMany([callSpec(address, `0xef8b30f7${pad32(amount6)}`)]);
  const shares = word(sharesHex);
  const [backHex, valueHex] = await rpcMany([
    callSpec(address, `0x4cdad506${pad32(shares)}`),
    callSpec(address, `0x07a2d13a${pad32(shares)}`),
  ]);
  const back = word(backHex);
  const value = word(valueHex);
  return { entry6: lossOf(amount6, value), exit6: lossOf(value, back) };
}

async function morphoApy(vault) {
  const [feeHex, maxHex, lengthHex] = await rpcMany([
    callSpec(vault.address, "0x87788782"),
    callSpec(vault.address, "0xece1d6e5"),
    callSpec(vault.adapter, "0xace48b45"),
  ]);
  const feeWad = word(feeHex);
  const maxRate = word(maxHex);
  const length = word(lengthHex);
  if (length === 0n) throw new Error("no markets");
  const idCalls = [];
  for (let i = 0n; i < length; i++) idCalls.push(callSpec(vault.adapter, `0x779a9683${pad32(i)}`));
  const idHexes = await rpcMany(idCalls);
  const ids = idHexes.map((value) => value.slice(2));
  const detail = [];
  for (const id of ids) {
    detail.push(callSpec(vault.adapter, `0x99f7e861${id}`));
    detail.push(callSpec(MORPHO, `0x2c3c9157${id}`));
    detail.push(callSpec(MORPHO, `0x5c60e39a${id}`));
  }
  const details = await rpcMany(detail);
  const rateCalls = [];
  const markets = [];
  for (let i = 0; i < ids.length; i++) {
    const expected = word(details[i * 3]);
    const paramsHex = details[i * 3 + 1];
    const marketHex = details[i * 3 + 2];
    const params = [0, 1, 2, 3, 4].map((index) => pad32(word(paramsHex, index)));
    const market = [0, 1, 2, 3, 4, 5].map((index) => pad32(word(marketHex, index)));
    markets.push({ expected, marketHex });
    rateCalls.push(callSpec(IRM, `0x8c00bf6b${params.join("")}${market.join("")}`));
  }
  const rates = await rpcMany(rateCalls);
  let weight = 0n;
  let acc = 0n;
  for (let i = 0; i < markets.length; i++) {
    const rate = word(rates[i]);
    const supply = word(markets[i].marketHex, 0);
    const borrow = word(markets[i].marketHex, 2);
    const marketFee = word(markets[i].marketHex, 5);
    const util = supply === 0n ? 0n : (borrow * WAD) / supply;
    const supplyRate = (((rate * util) / WAD) * (WAD - marketFee)) / WAD;
    weight += markets[i].expected;
    acc += markets[i].expected * supplyRate;
  }
  const blended = weight === 0n ? 0n : acc / weight;
  const capped = blended > maxRate ? maxRate : blended;
  const grossApyWad = apyFromPerSecond(capped);
  const netApyWad = (grossApyWad * (WAD - feeWad)) / WAD;
  return { grossApyWad, netApyWad, feeWad };
}

async function termmaxApy(address) {
  const [grossHex, feeHex] = await rpcMany([
    callSpec(address, "0x3bcfc4b8"),
    callSpec(address, "0x0ffbfda4"),
  ]);
  const gross = word(grossHex);
  const fee = word(feeHex);
  const grossApyWad = (gross * WAD) / TERM_RATE;
  const netApyWad = (grossApyWad * (TERM_RATE - fee)) / TERM_RATE;
  return { grossApyWad, netApyWad, feeWad: (fee * WAD) / TERM_RATE };
}

export async function readVault(vault, amount6, tag) {
  const [assetHex] = await rpcMany([callSpec(vault.address, "0x38d52e0f", tag)]);
  if (addressOf(assetHex) !== USDC) throw new Error("asset");
  const [rates, costs] = await Promise.all([
    vault.kind === "morpho" ? morphoApy(vault) : termmaxApy(vault.address),
    previewCosts(vault.address, amount6),
  ]);
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
    const [lastHex] = await rpcMany([callSpec(address, "0xc0463711")]);
    const last = word(lastHex);
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
    let logs = [];
    try {
      logs = await rpcOne("eth_getLogs", [{ address, fromBlock: hex(from), toBlock: hex(to) }]);
    } catch {
      continue;
    }
    for (const log of logs.reverse()) {
      const hash = log.transactionHash;
      if (seen.has(hash)) continue;
      seen.add(hash);
      const receipt = await rpcOne("eth_getTransactionReceipt", [hash]);
      if (receipt?.status === "0x1" && receipt.gasUsed) return BigInt(receipt.gasUsed);
    }
  }
  return null;
}

export async function readMarket(amount6) {
  const block = BigInt(await rpcOne("eth_blockNumber", []));
  const tag = hex(block);
  const [header, earlier, gasPriceHex, slot0, token0Hex, token1Hex, feeHex] = await rpcMany([
    { method: "eth_getBlockByNumber", params: [tag, false] },
    { method: "eth_getBlockByNumber", params: [hex(block > 1000n ? block - 1000n : 0n), false] },
    { method: "eth_gasPrice", params: [] },
    callSpec(POOL, "0x3850c7bd", tag),
    callSpec(POOL, "0x0dfe1681", tag),
    callSpec(POOL, "0xd21220a7", tag),
    callSpec(POOL, "0xddca3f43", tag),
  ]);
  const token0 = addressOf(token0Hex);
  const token1 = addressOf(token1Hex);
  const fee = word(feeHex);
  if (token0 !== WPROS || token1 !== USDC || fee !== 100n) throw new Error("pool");
  const now = BigInt(header.timestamp);
  const secPer1000 = now - BigInt(earlier.timestamp);
  const sources = await Promise.all(
    VAULTS.map(async (vault) => {
      try {
        return await readVault(vault, amount6, tag);
      } catch {
        return { id: vault.id, name: vault.name, protocol: vault.protocol, symbol: vault.symbol, address: vault.address, ok: false };
      }
    }),
  );
  return {
    block: block.toString(),
    at: new Date(Number(BigInt(header.timestamp)) * 1000).toISOString(),
    chainId: CHAIN_ID,
    gasPrice: BigInt(gasPriceHex),
    spot: spotUsdc6(word(slot0, 0)),
    now,
    secPer1000,
    sources,
  };
}

export async function measureMoveGas({ fromId, destId, amount6, market }) {
  const dest = VAULTS.find((row) => row.id === destId);
  const src = fromId === "idle" ? null : VAULTS.find((row) => row.id === fromId);
  if (!dest) return { gasUsdc6: null, approveGas: null, depositGas: null, withdrawGas: 0n };
  const head = BigInt(market.block);
  const [approveGas, depositGas, withdrawGas] = await Promise.all([
    rpcOne("eth_estimateGas", [{ from: SAMPLE, to: USDC, data: encodeApprove(dest.address, amount6) }])
      .then((value) => BigInt(value))
      .catch(() => null),
    recentGas(dest.address, head, market.now, market.secPer1000),
    src ? recentGas(src.address, head, market.now, market.secPer1000) : Promise.resolve(0n),
  ]);
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
  return BigInt(await rpcOne("eth_getTransactionCount", [SAMPLE, "latest"]));
}

export { SAMPLE, CHAIN_ID, USDC };

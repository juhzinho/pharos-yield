import test from "node:test";
import assert from "node:assert/strict";
import { evaluate, holdGain, parseForm } from "../public/yield.js";
import { encodeApprove, encodeDeposit, encodeWithdraw } from "../lib/encode.js";
import { SAMPLE } from "../lib/vaults.js";

function wad(percent) {
  return BigInt(percent) * 10n ** 16n;
}

function vault(id, net, extra = {}) {
  return {
    id,
    name: id,
    protocol: "test",
    symbol: id,
    ok: true,
    netApyWad: wad(net),
    grossApyWad: wad(extra.gross ?? net),
    feeWad: wad(extra.fee ?? 0),
    entry6: extra.entry ?? 0n,
    exit6: extra.exit ?? 0n,
  };
}

const three = [vault("rock", 6), vault("sharp", 5), vault("prime", 0)];

test("the form rejects a bad amount, extra decimals, a zero, a bad day count and a bad vault", () => {
  assert.equal(parseForm({ amount: "10.12.3", days: "7", from: "idle" }), null);
  assert.equal(parseForm({ amount: "1.1234567", days: "7", from: "idle" }), null);
  assert.equal(parseForm({ amount: "0", days: "7", from: "idle" }).amount6, 0n);
  assert.equal(parseForm({ amount: "100", days: "0", from: "idle" }), null);
  assert.equal(parseForm({ amount: "100", days: "366", from: "idle" }), null);
  assert.equal(parseForm({ amount: "100", days: "7", from: "harbor" }), null);
  const ok = parseForm({ amount: "100.12", days: "7", from: "rock" });
  assert.equal(ok.amount6, 100120000n);
  assert.equal(ok.days, 7);
});

test("a year of 1 percent extra on 100 USDC is 1 USDC", () => {
  assert.equal(holdGain(100_000000n, wad(5), wad(6), 365), 1_000000n);
});

test("three unread vaults fail the compare", () => {
  const out = evaluate({ amount: "100", days: "7", from: "idle", sources: three.slice(0, 2), gasUsdc6: 1n });
  assert.equal(out.ok, false);
  assert.match(out.reason, /Three yield sources/);
});

test("a missing gas figure stays put and still lists the three vaults", () => {
  const out = evaluate({ amount: "100", days: "7", from: "idle", sources: three, gasUsdc6: null });
  assert.equal(out.ok, true);
  assert.equal(out.decision, "stay");
  assert.match(out.reason, /gas was not measured/);
  assert.equal(out.sources.length, 3);
  assert.equal(out.executed, false);
  assert.equal(out.broadcast, false);
});

test("one day of extra yield does not cover the gas, so it stays put", () => {
  const out = evaluate({ amount: "100", days: "1", from: "idle", sources: three, gasUsdc6: 1_000000n });
  assert.equal(out.decision, "stay");
  assert.equal(out.headline, "Stay put.");
  assert.equal(out.pick.id, "rock");
  assert.equal(out.txs, null);
});

test("a year of extra yield above the cost prepares the move", () => {
  const out = evaluate({ amount: "100", days: "365", from: "idle", sources: three, gasUsdc6: 100000n });
  assert.equal(out.decision, "prepare");
  assert.equal(out.headline, "Prepare the move.");
  assert.equal(out.pick.id, "rock");
  assert.equal(out.pick.gain, "6.000000");
  assert.equal(out.broadcast, false);
});

test("a net of zero stays put", () => {
  const out = evaluate({
    amount: "100",
    days: "365",
    from: "idle",
    sources: three,
    gasUsdc6: 6_000000n,
  });
  assert.equal(out.decision, "stay");
  assert.equal(out.pick.net, "0.000000");
});

test("already sitting in the highest vault stays put after costs", () => {
  const out = evaluate({ amount: "100", days: "365", from: "rock", sources: three, gasUsdc6: 1n });
  assert.equal(out.decision, "stay");
  assert.equal(out.pick.id, "sharp");
});

test("entry and exit are taken from the source and the destination, not invented", () => {
  const sources = [
    vault("rock", 6, { exit: 150000n }),
    vault("sharp", 8, { entry: 200000n }),
    vault("prime", 0),
  ];
  const out = evaluate({ amount: "1000", days: "365", from: "rock", sources, gasUsdc6: 10000n });
  assert.equal(out.decision, "prepare");
  assert.equal(out.pick.id, "sharp");
  assert.equal(out.pick.exit, "0.150000");
  assert.equal(out.pick.entry, "0.200000");
  assert.equal(out.pick.gas, "0.010000");
});

test("the Portuguese stay line names the net and the cost", () => {
  const out = evaluate({ amount: "100", days: "1", from: "idle", sources: three, gasUsdc6: 1_000000n, lang: "pt" });
  assert.equal(out.headline, "Ficar onde está.");
  assert.match(out.reason, /não está acima do custo/);
});

test("the unsigned calls encode withdraw, approve and deposit without a broadcast flag", () => {
  const withdraw = encodeWithdraw(100n, SAMPLE, SAMPLE);
  const approve = encodeApprove("0x047cD0a91E9B92ED979189a6C8A120bf280f02E5", 100n);
  const deposit = encodeDeposit(100n, SAMPLE);
  assert.equal(withdraw.startsWith("0xb460af94"), true);
  assert.equal(approve.startsWith("0x095ea7b3"), true);
  assert.equal(deposit.startsWith("0x6e553f65"), true);
});

function pad32(value) {
  return BigInt(value).toString(16).padStart(64, "0");
}

function addr(value) {
  return value.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

export function encodeApprove(spender, amount) {
  return `0x095ea7b3${addr(spender)}${pad32(amount)}`;
}

export function encodeDeposit(assets, receiver) {
  return `0x6e553f65${pad32(assets)}${addr(receiver)}`;
}

export function encodeWithdraw(assets, receiver, owner) {
  return `0xb460af94${pad32(assets)}${addr(receiver)}${addr(owner)}`;
}

export function encodeCall(to, data, { from, nonce, gas, gasPrice, chainId }) {
  return {
    type: "0x0",
    chainId: `0x${BigInt(chainId).toString(16)}`,
    from,
    to,
    value: "0x0",
    data,
    nonce: `0x${BigInt(nonce).toString(16)}`,
    gas: `0x${BigInt(gas).toString(16)}`,
    gasPrice: `0x${BigInt(gasPrice).toString(16)}`,
    broadcast: false,
    executed: false,
  };
}

export const RPC = "https://rpc.pharos.xyz";
export const CHAIN_ID = 1672;
export const SAMPLE = "0x15dDce897D76ac39c188AdE4D353711A60395315";
export const USDC = "0xc879c018db60520f4355c26ed1a6d572cdac1815";
export const WPROS = "0x52c48d4213107b20bc583832b0d951fb9ca8f0b0";
export const POOL = "0x912c9ade24d44d8922f0866d8dcb079f1363f647";
export const MORPHO = "0x18573fa18fd17ddfd790b4a5b5b2977aad3b4efb";
export const IRM = "0xd5e02889c13230458506cc842347c4e62f8cdf3a";
export const WAD = 10n ** 18n;
export const YEAR = 31536000n;
export const TERM_RATE = 10n ** 8n;

export const VAULTS = [
  {
    id: "rock",
    protocol: "Morpho",
    name: "RockawayX USDC",
    symbol: "roxUSDC",
    address: "0x047cD0a91E9B92ED979189a6C8A120bf280f02E5",
    adapter: "0xba3b260596d8412318ee6ef5476291f6c8e3b68a",
    kind: "morpho",
    shareDecimals: 18,
  },
  {
    id: "sharp",
    protocol: "Morpho",
    name: "SharpByte USDC",
    symbol: "sbUSDC",
    address: "0x15c25ED222fc498f672af5c3adb5ED0a96E1AFf1",
    adapter: "0xc18c67dcc3dbd439fffbb49b367b24bdfbe7f709",
    kind: "morpho",
    shareDecimals: 18,
  },
  {
    id: "prime",
    protocol: "TermMax",
    name: "SharpByte Pharos Prime",
    symbol: "sbPharosPrime",
    address: "0x697322F0bB715fc1e4C1f1283a9F8e546Cb4a342",
    adapter: null,
    kind: "termmax",
    shareDecimals: 6,
  },
];

export const FROM = ["idle", "rock", "sharp", "prime"];

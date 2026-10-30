# Pharos Yield

Live page: https://pharos-yield.vercel.app

Compares three live USDC vaults on Pacific: RockawayX Morpho, SharpByte Morpho, and TermMax Pharos Prime. Each net rate is read from that vault. The extra yield over the holding period has to cover gas, the exit of the current place, and the entry of the destination. If it does not, the answer is stay put. When a move is worth it, the calls stay unsigned.

```bash
npm test
npm run web
```

Open http://localhost:3060. The example buttons fill the amount, the days and the current place. Compare runs only from the Compare button.

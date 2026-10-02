# SUPERmarket Empire

Next.js 14 + Zustand supermarket tycoon. `npm run dev` · `npm run build` · `npm test` (rules + save/load tests) · `npm run sim` (economy bot) · `npm run assets` (re-make the web sprites).

## Where things live
- `lib/simulation.ts` the whole simulation (customers, checkout, stock, wages, theft, cleanliness, events, XP). `lib/economy.ts` pure formulas.
- `lib/constants.ts` categories (`AISLE_DEFS`) and store tiers (`TIERS`: floor size, aisle types, staff slots, upkeep, level needed).
- `lib/customers.ts` customer types. Add one entry to add a shopper type. `lib/events.ts` daily events, same idea.
- `lib/staff.ts` employee roles, wages, efficiency. `lib/progress.ts` XP curve, objectives (then an endless ladder), achievements.
- `lib/monetization.ts` inert seam for future rewarded ads / IAP. No SDKs. The save already carries `gems`, `cosmetics`, `adsRemoved`.
- `lib/assets.ts` every sprite path. Sprites are WebP copies in `public/assets/web/` generated from the original PNGs (`scripts/optimize-assets.py`, 92 MB to about 1 MB). Originals are untouched.
- `store/store.ts` actions + save/load (`SAVE_KEY` unchanged; v1 saves load and migrate).

## Debug
Dev builds show a debug bar (cash, XP, spawn, speed). For a production build set `NEXT_PUBLIC_DEBUG=1`.

# SUPERmarket Empire

Next.js 14 + Zustand supermarket tycoon. `npm run dev` · `npm run build` · `npm test` (rules + save/load tests) · `npm run sim` (economy bot) · `npm run assets` (re-make the web sprites).

## Navigation (customers walk the layout you build)
- `lib/navigation.ts` turns the placed shelves, checkouts, restocker desks and decor into a tile grid (`analyzeStore`, cached by a hash of tile positions, so it is rebuilt only when the layout changes). `findRoute` searches that grid **from where a walker is standing** and string-pulls the result with body clearance, so nobody grazes a shelf corner.
- Shoppers and roaming staff are real walkers in `lib/simulation.ts` (x/y in tile-centre coordinates, the same space the 3D scene uses). Every stage (street → door → shelf → browse → queue → till → exit) is a route request; nothing is a timer plus a lerp, and there are no stored waypoints.
- A walker re-routes when the layout version changes (at most 48 per tick, the rest hold still rather than follow a stale route). Unreachable shelf → "Can't reach shelf" and they skip it; no reachable checkout → they leave unhappy; someone standing where a shelf is built is moved to the nearest free tile.
- Queues are chains of open tiles behind each till (`Layout.slots`). The next shopper only starts paying once they have actually reached slot 0.
- Footfall is driven by shelf levels only (`appealOf`) and the shop holds `PEOPLE_PER_TILE` shoppers per floor tile; extra arrivals walk on and a "Store is full" alert shows.
- Tests: `npm test` runs the rules tests plus `scripts/test-nav.ts` (routing around shelves, narrow gaps, sealed rooms, layouts changed mid-walk, blocked shelves, crew, perf budget).

## Mobile shell
World fills the screen; `Hud` (cash, level, sales/s, shoppers, satisfaction), one `ObjectiveChip` + the single most urgent alert, a 4-button `ActionBar`. Build/Staff/Supply/Goals open as bottom sheets (side drawer on desktop). Tapping an object in the world opens a `ContextCard` with just that object's actions. View state lives in `store/ui.ts`.

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

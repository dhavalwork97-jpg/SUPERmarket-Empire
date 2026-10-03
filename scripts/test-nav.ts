/** Navigation + customer-walking tests. Run with: npm test. Plain asserts. */
import assert from "node:assert/strict";
import { simulate, defaultExtras, defaultSupply, deriveAisle, deriveCheckout, deriveRestocker, analyzeLayout, demandOf } from "../lib/simulation";
import { findRoute, segmentClear, entranceTile, WALK_SPEED } from "../lib/navigation";
import { AisleType, SimData } from "../types/game";
import { AISLE_ORDER, TIERS } from "../lib/constants";
let n = 0; const t = (name: string, f: () => void) => { f(); n++; console.log("ok -", name); };

const aisle = (id: string, type: AisleType, x: number, y: number) => deriveAisle({ id, type, level: 1, stock: 1e6, maxStock: 0, baseRevenue: 0, demandRate: 0, stockConsumptionRate: 0, upgradeCost: 0, x, y });
const checkout = (id: string, x: number, y: number) => deriveCheckout({ id, level: 1, processingTime: 0, queueCapacity: 0, currentCustomerProgress: 0, customersProcessed: 0, upgradeCost: 0, x, y }, 0);
/** A store on the big floor (11x7) with whatever the "player" placed. Stock is effectively unlimited so only layout matters. */
const store = (shelves: [number, number][], tills: [number, number][], tier = 2): SimData => {
  const s: SimData = { cash: 1e6, tier, lifetimeRevenue: 0, totalCustomersServed: 0, earningsPerSecond: 0, lastSavedTimestamp: 0, customers: [], floats: [], spawnAcc: 0, nextId: 1,
    aisles: shelves.map(([x, y], i) => aisle("a" + (i + 1), AISLE_ORDER[i % 3], x, y)), checkouts: tills.map(([x, y], i) => checkout("c" + (i + 1), x, y)),
    restockers: [deriveRestocker({ id: "r1", level: 1, restockAmount: 0, cooldown: 0, currentCooldown: 0, assignedAisleId: null, upgradeCost: 0, x: 10, y: 0 }, 0)], decors: [], ...defaultSupply(), ...defaultExtras() };
  s.storeroom = Object.fromEntries(AISLE_ORDER.map((k) => [k, 1e6])) as any; s.satisfaction = 0.8; return s;
};
const feed = (s: SimData, perSec: number, dt: number) => { s.spawnAcc += perSec * dt; };
const blockedTiles = (s: SimData) => [...s.aisles, ...s.checkouts, ...s.restockers, ...s.decors].map((i) => ({ x: i.x, y: i.y }));
/** Smallest gap between any walker and any occupied tile, ignoring the street. Negative = someone is standing inside furniture. */
const clearance = (s: SimData) => {
  const { rows } = TIERS[s.tier]; let min = Infinity; const B = blockedTiles(s);
  for (const p of [...s.customers, ...s.crew]) { if (p.y > rows - 0.5) continue;
    for (const b of B) { const dx = Math.abs(p.x - b.x) - 0.5, dy = Math.abs(p.y - b.y) - 0.5; const d = dx > 0 || dy > 0 ? Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) : Math.max(dx, dy); if (d < min) min = d; } }
  return min;
};
/** Run the sim, return the worst clearance seen. `edit` may change the layout mid-run (return true when it did). */
function soak(s: SimData, secs: number, perSec = 0.5, edit?: (s: SimData, sec: number) => boolean | void, grace = 0) {
  let worst = Infinity, lastEdit = -99;
  for (let i = 0; i < secs * 10; i++) { const sec = i / 10; if (edit && i % 10 === 0 && edit(s, sec)) lastEdit = sec;
    feed(s, perSec, 0.1); s = simulate(s, 0.1); if (sec - lastEdit > grace) worst = Math.min(worst, clearance(s)); }
  return { s, worst };
}
const MIN_CLEAR = 0.08;

t("routes avoid shelves and never graze them", () => {
  const s = store([[3, 2], [3, 3], [3, 4], [3, 5]], [[8, 6]]); const L = analyzeLayout(s), ent = entranceTile(7);
  const r = findRoute(L.grid, ent, [{ x: 6, y: 3 }])!; assert.ok(r, "a way round the shelf row exists");
  let p: { x: number; y: number } = ent; for (const w of r.path) { assert.ok(segmentClear(L.grid, p, w), `leg ${JSON.stringify(p)} -> ${JSON.stringify(w)}`); p = w; }
  assert.ok(r.path.length >= 2, "a straight line would cut through the shelves");
});
t("a sealed room is unreachable: no route, no phasing", () => {
  const wall = Array.from({ length: 11 }, (_, i) => [i, 3] as [number, number]);
  const s = store(wall, [[5, 0]]); const L = analyzeLayout(s);
  assert.equal(findRoute(L.grid, entranceTile(7), [{ x: 5, y: 1 }]), null);
  assert.ok(!isFinite(L.dist.E.c1));
});
t("default-ish layout: shoppers shop, queue, pay and walk out without touching furniture", () => {
  const { s, worst } = soak(store([[2, 1], [5, 1], [8, 1], [2, 4], [8, 4]], [[4, 6], [6, 6]]), 400, 0.4);
  assert.ok(s.totalCustomersServed > 40, `served ${s.totalCustomersServed}`); assert.ok(worst >= MIN_CLEAR, `clearance ${worst}`);
});
t("tight one-tile aisle: customers use the gap", () => {
  const shelves: [number, number][] = [[2, 2], [3, 2], [4, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2]]; // gap at x = 5
  const { s, worst } = soak(store(shelves.concat([[5, 0]]), [[9, 6]]), 300, 0.4); assert.ok(s.totalCustomersServed > 10, `served ${s.totalCustomersServed}`); assert.ok(worst >= MIN_CLEAR, `clearance ${worst}`);
});
t("player moves shelves while shoppers are walking: everyone re-routes, nobody clips", () => {
  const layouts: [number, number][][] = [[[3, 1], [6, 1], [9, 1], [3, 4]], [[2, 3], [5, 3], [8, 3], [9, 5]], [[1, 1], [1, 2], [1, 3], [1, 4]], [[4, 0], [4, 1], [4, 2], [4, 3], [4, 4], [6, 5]]];
  let k = 0;
  const { s, worst } = soak(store(layouts[0], [[6, 6], [9, 6]]), 600, 0.5, (st, sec) => { if (sec > 0 && sec % 40 === 0) { k = (k + 1) % layouts.length; st.aisles = layouts[k].map(([x, y], i) => aisle("a" + (i + 1), AISLE_ORDER[i % 3], x, y)); return true; } }, 3);
  assert.ok(s.totalCustomersServed > 60, `served ${s.totalCustomersServed}`); assert.ok(worst >= MIN_CLEAR, `clearance ${worst}`);
});
t("a layout with no way to the checkout: shoppers leave unhappy, never walk through the wall", () => {
  const wall = Array.from({ length: 11 }, (_, i) => [i, 4] as [number, number]); const s0 = store(wall.concat([[5, 1]]), [[5, 6]]);
  s0.checkouts = [checkout("c1", 5, 0)]; // till sits behind the wall of shelves, entrance is on the other side
  const { s, worst } = soak(s0, 200, 0.5); assert.equal(s.totalCustomersServed, 0); assert.ok(s.satisfaction < 0.8, `sat ${s.satisfaction}`); assert.ok(worst >= MIN_CLEAR, `clearance ${worst}`);
});
t("blocked shelf is skipped with a message instead of being walked through", () => {
  let s = store([[5, 1], [2, 5]], [[8, 6]]); s.aisles[0].demandRate = 1; s.aisles[1].demandRate = 1; let said = false;
  for (let i = 0; i < 3000; i++) { feed(s, 0.5, 0.1); s = simulate(s, 0.1); if (i === 150) s = { ...s, aisles: s.aisles.concat([aisle("a3", "bakery", 4, 1), aisle("a4", "bakery", 6, 1), aisle("a5", "bakery", 5, 0), aisle("a6", "bakery", 5, 2)]) }; // fence in a1
    if (s.customers.some((c) => c.say === "Can't reach shelf")) said = true; if (i > 200) assert.ok(clearance(s) >= MIN_CLEAR, `clearance ${clearance(s)} at ${i}`); }
  assert.ok(said, "someone said they can't reach the shelf");
});
t("someone caught standing where a shelf is built steps out, never stuck inside it", () => {
  let s = store([[5, 1]], [[8, 6]]); s.customers = [{ id: 99, phase: "SHOPPING", kind: "normal", mood: "🛒", basket: 0, wait: 0, co: null, plan: ["a1"], stop: 0, dwell: 0, x: 3, y: 3, path: [], pi: 0, goal: "", nav: -1, lost: false, stuck: 0, qn: 0 }];
  s = { ...s, aisles: s.aisles.concat([aisle("a2", "bakery", 3, 3)]) };
  for (let i = 0; i < 60; i++) s = simulate(s, 0.1);
  const c = s.customers[0]; assert.ok(!c || Math.hypot(c.x - 3, c.y - 3) > 0.45, "left the tile that became a shelf");
});
t("queues form on open floor in a chain, distinct positions, free tiles only", () => {
  const s = store([[5, 1]], [[5, 3], [8, 5]]); const L = analyzeLayout(s), B = new Set(blockedTiles(s).map((b) => `${b.x},${b.y}`));
  for (const k of s.checkouts) { const sl = L.slots[k.id]; assert.ok(sl.length >= 8, `slots ${sl.length}`); assert.ok(Math.hypot(sl[0].x - k.x, sl[0].y - k.y) < 1.0, "head of queue touches the till");
    for (const p of sl) assert.ok(!B.has(`${Math.round(p.x)},${Math.round(p.y)}`), "slot inside furniture"); }
});
t("crew (cleaner, guard, manager, restocker) never walk through furniture either", () => {
  const s0 = store([[2, 1], [5, 1], [8, 1], [2, 4], [8, 4]], [[4, 6]]); s0.staff = [{ id: "s1", role: "cleaner", level: 1, efficiency: 1, workload: 0, salary: 0, upgradeCost: 0 }, { id: "s2", role: "security", level: 1, efficiency: 1, workload: 0, salary: 0, upgradeCost: 0 }, { id: "s3", role: "manager", level: 1, efficiency: 1, workload: 0, salary: 0, upgradeCost: 0 }];
  s0.aisles.forEach((a) => (a.stock = 10)); let s = s0, worst = Infinity, moved = 0, last = "";
  for (let i = 0; i < 3000; i++) { feed(s, 0.4, 0.1); s = simulate(s, 0.1); worst = Math.min(worst, clearance(s)); const sig = s.crew.map((c) => `${c.x.toFixed(1)}${c.y.toFixed(1)}`).join(); if (sig !== last) { moved++; last = sig; } }
  assert.equal(s.crew.length, 4); assert.ok(moved > 100, "crew moves"); assert.ok(worst >= MIN_CLEAR, `clearance ${worst}`);
});
t("walking time comes from distance, not from a timer (a longer detour takes longer)", () => {
  const time = (shelves: [number, number][]) => { let s = store(shelves, [[8, 6]]); s.aisles[0].demandRate = 1; s.customers = []; s.spawnAcc = 1; let i = 0; for (; i < 6000; i++) { s = simulate(s, 0.1); if (s.totalCustomersServed > 0) break; } return i / 10; };
  const near = time([[1, 5]]), far = time([[10, 0]]); assert.ok(far > near + 5, `near ${near}s far ${far}s`);
});
t("one layout change is cheap: a crowd re-routes within a bounded budget per tick", () => {
  let s = store([[2, 1], [5, 1], [8, 1], [2, 4], [8, 4]], [[4, 6], [6, 6]]);
  for (let i = 0; i < 1200; i++) { feed(s, 1.5, 0.1); s = simulate(s, 0.1); } const crowd = s.customers.length; assert.ok(crowd > 40, `crowd ${crowd}`);
  s = { ...s, aisles: s.aisles.map((a, i) => (i === 0 ? { ...a, x: 6, y: 3 } : a)) };
  const t0 = performance.now(); s = simulate(s, 0.1); const ms = performance.now() - t0; assert.ok(ms < 60, `first tick after a layout change took ${ms.toFixed(1)}ms for ${crowd} shoppers`);
});
t("steady state: the layout object is cached, no per-tick rebuild", () => {
  let s = store([[2, 1], [5, 1], [8, 1]], [[4, 6]]); const a = analyzeLayout(s); s = simulate(s, 0.1); assert.equal(analyzeLayout(s), a);
});
t("footfall comes from shelves only: upgrading tills and restockers does not attract shoppers", () => {
  const s = store([[2, 1]], [[4, 6]], 0), d0 = demandOf(s); s.checkouts[0] = deriveCheckout({ ...s.checkouts[0], level: 20 }, 0); s.restockers[0] = deriveRestocker({ ...s.restockers[0], level: 20 }, 0);
  assert.equal(demandOf(s), d0); s.aisles[0] = deriveAisle({ ...s.aisles[0], level: 4 }); assert.ok(demandOf(s) > d0);
});
t("opening footfall is a shopper every ~8 s, not every ~5 s", () => { const s = store([[1, 0]], [[2, 3]], 0); const gap = 1 / demandOf(s); assert.ok(gap > 7 && gap < 10, `gap ${gap}`); assert.ok(WALK_SPEED < 1); });
console.log(`\n${n} navigation tests passed`); process.exit(0);

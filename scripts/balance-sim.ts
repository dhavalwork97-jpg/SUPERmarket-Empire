import { simulate, storeStatus, placeCost, orderCost, deriveAisle, deriveCheckout, deriveRestocker, analyzeLayout, defaultSupply } from "../lib/simulation";
import { AISLE_DEFS, AISLE_ORDER, TIERS, START_CASH } from "../lib/constants";
import { getAisleRevenue } from "../lib/economy";
import { SimData } from "../types/game";
const mk = (): SimData => ({ cash: START_CASH, tier: 0, lifetimeRevenue: 0, totalCustomersServed: 0, earningsPerSecond: 0, lastSavedTimestamp: 0, customers: [], floats: [], spawnAcc: 0, nextId: 1,
  aisles: [deriveAisle({ id: "a1", type: "produce", level: 1, stock: 100, maxStock: 0, baseRevenue: 0, demandRate: 0, stockConsumptionRate: 0, upgradeCost: 0, x: 1, y: 0 })],
  checkouts: [deriveCheckout({ id: "c1", level: 1, processingTime: 0, queueCapacity: 0, currentCustomerProgress: 0, customersProcessed: 0, upgradeCost: 0, x: 2, y: 3 }, 0)],
  decors: [], ...defaultSupply(), restockers: [deriveRestocker({ id: "r1", level: 1, restockAmount: 0, cooldown: 0, currentCooldown: 0, assignedAisleId: null, upgradeCost: 0, x: 0, y: 1 }, 0)] });
const seq = (l: { id: string }[], p: string) => p + (Math.max(0, ...l.map((x) => parseInt(x.id.slice(1)) || 0)) + 1);
const placeOk = (s: SimData, x: number, y: number) => { const { rows } = TIERS[s.tier]; if (x === 0 && y === rows - 1) return false;
  const t = { ...s, aisles: [...s.aisles, { ...s.aisles[0], id: "tmp", x, y }] }; const L = analyzeLayout(t);
  return [...t.aisles, ...t.checkouts].every((i) => isFinite(L.dist.E[i.id])) && t.checkouts.every((k) => (L.spots[k.id] ?? 0) >= 6); };
const spotCache = new Map<string, { x: number; y: number } | null>();
const freeTile = (s: SimData, near = false) => { const key = `${near}|${s.tier}|${s.aisles.length}|${s.checkouts.length}|${s.restockers.length}`; if (spotCache.has(key)) return spotCache.get(key)!;
  const { cols, rows } = TIERS[s.tier]; const t = new Set([...s.aisles, ...s.checkouts, ...s.restockers].map((i) => `${i.x},${i.y}`)); let spot: { x: number; y: number } | null = null;
  const cells: { x: number; y: number }[] = []; for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) cells.push({ x, y });
  if (near) cells.sort((a, b) => a.x + (rows - 1 - a.y) - (b.x + (rows - 1 - b.y)));
  for (const c of cells) if (!t.has(`${c.x},${c.y}`) && placeOk(s, c.x, c.y)) { spot = c; break; }
  spotCache.clear(); spotCache.set(key, spot); return spot; };
type Opt = { cost: number; val: number; run: () => void; tag: string };
function act(s: SimData, log: (m: string) => void): boolean {
  const next = TIERS[s.tier + 1], st = storeStatus(s);
  if (next && s.cash >= next.cost) { s.cash -= next.cost; s.tier++; log(`EXPAND -> ${next.name}`); return true; }
  if (next && next.cost <= 600 * Math.max(s.earningsPerSecond, 0.1) && s.cash < next.cost) return false; // saving for tier
  const spot = freeTile(s), spotC = freeTile(s, true), opts: Opt[] = [];
  const upg = (list: any[], derive: (x: any) => any, key: "aisles" | "checkouts" | "restockers", valf: (x: any) => number, tag: string) =>
    list.forEach((x) => opts.push({ cost: x.upgradeCost, val: valf(x), tag: `${tag} up`, run: () => { s[key] = (s[key] as any[]).map((y) => (y.id === x.id ? derive({ ...y, level: y.level + 1 }) : y)) as any; } }));
  upg(s.aisles, (x) => deriveAisle(x), "aisles", (a) => (getAisleRevenue(a.baseRevenue, a.level + 1) - getAisleRevenue(a.baseRevenue, a.level)) * a.demandRate, "aisle");
  upg(s.checkouts, (x) => deriveCheckout(x, 0), "checkouts", () => 1, "checkout");
  upg(s.restockers, (x) => deriveRestocker(x, 0), "restockers", () => 1, "restock");
  if (spot) {
    AISLE_ORDER.slice(0, TIERS[s.tier].aisles).forEach((t) => opts.push({ cost: placeCost(s, "aisle", t), val: AISLE_DEFS[t].rev * AISLE_DEFS[t].demand, tag: `new ${t}`, run: () => { s.aisles.push(deriveAisle({ id: seq(s.aisles, "a"), type: t, level: 1, stock: AISLE_DEFS[t].stock, maxStock: 0, baseRevenue: 0, demandRate: 0, stockConsumptionRate: 0, upgradeCost: 0, ...spot })); } }));
    opts.push({ cost: placeCost(s, "checkout"), val: 1, tag: "new checkout", run: () => { s.checkouts.push(deriveCheckout({ id: seq(s.checkouts, "c"), level: 1, processingTime: 0, queueCapacity: 0, currentCustomerProgress: 0, customersProcessed: 0, upgradeCost: 0, ...(spotC ?? spot) }, 0)); } });
    opts.push({ cost: placeCost(s, "restocker"), val: 1, tag: "new restock", run: () => { const f = s.aisles.find((a) => !s.restockers.some((r) => r.assignedAisleId === a.id)) ?? s.aisles[0]; s.restockers.push(deriveRestocker({ id: seq(s.restockers, "r"), level: 1, restockAmount: 0, cooldown: 0, currentCooldown: 0, assignedAisleId: null, upgradeCost: 0, ...spot }, 0)); } });
  }
  const reserve = [...new Set(s.aisles.map((x) => x.type))].reduce((n, t) => n + orderCost(t, 50), 0);
  const afford = opts.filter((o) => o.cost <= s.cash - reserve); if (!afford.length) return false;
  const low = s.aisles.some((a) => a.stock / a.maxStock < 0.3);
  let pool = afford;
  if (st.meters.checkout > 0.5) pool = afford.filter((o) => o.tag.includes("checkout")); else if (low) pool = afford.filter((o) => o.tag.includes("restock"));
  if (!pool.length) pool = afford.filter((o) => o.tag.startsWith("aisle") || o.tag.startsWith("new a") || o.tag.startsWith("new p") || o.tag.startsWith("new b") || o.tag.startsWith("new e") || o.tag.startsWith("new r") && !o.tag.includes("restock") || o.tag.startsWith("new f") || o.tag.startsWith("new d"));
  if (!pool.length) pool = afford;
  const best = pool.sort((a, b) => b.val / b.cost - a.val / a.cost)[0];
  s.cash -= best.cost; best.run(); log(best.tag); return true;
}
let s = mk(); const dt = 0.1, HOURS = Number(process.argv[2] ?? 3), steps = HOURS * 36000; const t0 = { v: 0 }; const buys: Record<string, number> = {};
const lines: string[] = []; let served0 = 0;
for (let i = 1; i <= steps; i++) {
  s = simulate(s, dt) as SimData; t0.v = i * dt;
  if (i % 10 === 0) { let n = 0; while (n++ < 5 && act(s, (m) => { buys[m] = (buys[m] || 0) + 1; if (m.startsWith("EXPAND") || m === "new checkout" && s.checkouts.length <= 2) lines.push(`  t=${(t0.v / 60).toFixed(1)}min  ${m}`); })) {} }
  if (i % 3000 === 0) { const st = storeStatus(s); lines.push(`${String(Math.round(t0.v / 60)).padStart(4)}min  cash=${s.cash.toFixed(0).padStart(9)}  eps=${s.earningsPerSecond.toFixed(1).padStart(7)}  tier=${s.tier}  items=${s.aisles.length}A/${s.checkouts.length}C/${s.restockers.length}R  cust=${s.customers.length}  queue=${(st.meters.checkout * 100).toFixed(0)}%  stock=${(st.meters.inventory * 100).toFixed(0)}%  ${st.bottleneck}  served=${s.totalCustomersServed}`); }
}
console.log(lines.join("\n")); console.log("purchases:", JSON.stringify(buys)); console.log("lifetime revenue:", s.lifetimeRevenue.toFixed(0));

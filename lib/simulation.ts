import { AISLE_DEFS, CHECKOUT, RESTOCK, AISLE_MULT, BASE_DEMAND, MAX_CUSTOMERS, TIERS, AISLE_ORDER, DELIVERY_TIME } from "./constants";
import * as E from "./economy";
import { AisleState, Bottleneck, CheckoutState, Customer, RestockerState, SimData } from "@/types/game";

export const rnd = (a: number, b: number) => a + Math.random() * (b - a);
export const aisleCost = (a: AisleState) => E.getUpgradeCost(AISLE_DEFS[a.type].cost, AISLE_MULT, a.level);
export function deriveAisle(a: AisleState): AisleState {
  const d = AISLE_DEFS[a.type], l = Math.max(1, a.level);
  const maxStock = E.getAisleMaxStock(d.stock, l);
  return { ...a, maxStock, baseRevenue: d.rev, demandRate: d.demand, stockConsumptionRate: d.use, stock: Math.min(maxStock, Math.max(0, a.stock)), upgradeCost: aisleCost(a) };
}
export function deriveCheckout(c: CheckoutState, i: number): CheckoutState {
  return { ...c, processingTime: E.getCheckoutProcessingTime(CHECKOUT.time, Math.max(1, c.level)), queueCapacity: E.getCheckoutCapacity(CHECKOUT.cap, Math.max(1, c.level)), upgradeCost: E.getUpgradeCost(CHECKOUT.cost * (1 + i * 4), CHECKOUT.mult, c.level) };
}
export function deriveRestocker(r: RestockerState, i: number): RestockerState {
  return { ...r, restockAmount: E.getRestockAmount(RESTOCK.amount, Math.max(1, r.level)), cooldown: E.getRestockCooldown(RESTOCK.cooldown, Math.max(1, r.level)), upgradeCost: E.getUpgradeCost(RESTOCK.cost * (1 + i * 3), RESTOCK.mult, r.level) };
}
export const storeLevel = (s: SimData) => [...s.aisles, ...s.checkouts, ...s.restockers].reduce((n, x) => n + x.level, 0);
export const demandOf = (s: SimData) => E.getCustomerDemand(storeLevel(s), BASE_DEMAND) * TIERS[Math.min(s.tier, TIERS.length - 1)].demand;

export type Layout = { dist: Record<string, Record<string, number>>; spots: Record<string, number>; boost: Record<string, number> };
let cacheKey = "", cache: Layout | null = null;
const tierOf = (s: SimData) => TIERS[Math.min(s.tier, TIERS.length - 1)];
/** Walkable-grid analysis: BFS distances between entrance "E", shelves and checkouts; queue space; decor boosts. Cached by layout. */
export function analyzeLayout(s: SimData): Layout {
  const { cols, rows } = tierOf(s);
  const key = `${cols}x${rows}|` + [...s.aisles, ...s.checkouts].map((i) => `${i.id}${i.x},${i.y}`).join(";") + "|" + s.decors.map((d) => `${d.x},${d.y}`).join(";");
  if (cache && key === cacheKey) return cache;
  const blocked = new Set([...s.aisles, ...s.checkouts].map((i) => `${i.x},${i.y}`));
  const free = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows && !blocked.has(`${x},${y}`);
  const N: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const bfs = (src: [number, number][]) => {
    const d = new Map<string, number>(), q: [number, number][] = [];
    for (const [x, y] of src) if (free(x, y)) { d.set(`${x},${y}`, 0); q.push([x, y]); }
    for (let i = 0; i < q.length; i++) { const [x, y] = q[i], v = d.get(`${x},${y}`)!;
      for (const [dx, dy] of N) { const k = `${x + dx},${y + dy}`; if (free(x + dx, y + dy) && !d.has(k)) { d.set(k, v + 1); q.push([x + dx, y + dy]); } } }
    return d;
  };
  const items = [...s.aisles, ...s.checkouts];
  const pois = [{ id: "E", acc: [[0, rows - 1]] as [number, number][] }, ...items.map((i) => ({ id: i.id, acc: N.map(([dx, dy]) => [i.x + dx, i.y + dy] as [number, number]) }))];
  const fields = pois.map((p) => bfs(p.acc)), dist: Layout["dist"] = {};
  pois.forEach((p, a) => { dist[p.id] = {}; pois.forEach((q) => { let m = Infinity; for (const [x, y] of q.acc) m = Math.min(m, fields[a].get(`${x},${y}`) ?? Infinity); dist[p.id][q.id] = m; }); });
  const spots: Layout["spots"] = {}, boost: Layout["boost"] = {};
  for (const k of s.checkouts) { let n = 0; for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) if (Math.abs(dx) + Math.abs(dy) <= 3 && free(k.x + dx, k.y + dy)) n++; spots[k.id] = n; }
  for (const a of s.aisles) boost[a.id] = 1 + 0.1 * Math.min(5, s.decors.filter((d) => Math.abs(d.x - a.x) + Math.abs(d.y - a.y) <= 2).length);
  cacheKey = key; cache = { dist, spots, boost }; return cache;
}

export function simulate(s: SimData, dt: number): SimData {
  const L = analyzeLayout(s);
  const aisles = s.aisles.map((a) => ({ ...a })), restockers = s.restockers.map((r) => ({ ...r }));
  const checkouts = s.checkouts.map((c) => ({ ...c, queueCapacity: Math.min(E.getCheckoutCapacity(CHECKOUT.cap, Math.max(1, c.level)), Math.max(1, L.spots[c.id] ?? 1)) }));
  let customers: Customer[] = s.customers.map((c) => ({ ...c }));
  let { cash, lifetimeRevenue, totalCustomersServed, nextId, spawnAcc } = s;
  let revenue = 0, cogs = 0;
  const storeroom = { ...s.storeroom };
  let orders = s.orders.map((o) => ({ ...o, eta: o.eta - dt }));
  const floats = s.floats.map((f) => ({ ...f, age: f.age + dt })).filter((f) => f.age < 1.5);
  const active = checkouts.filter((c) => c.level > 0);

  spawnAcc += demandOf(s) * dt;
  while (spawnAcc >= 1) { spawnAcc -= 1; if (customers.length < MAX_CUSTOMERS) customers.push({ id: nextId++, phase: "ENTERING", t: 1, wait: 0, basket: 0, co: null, mood: "🚶", plan: [] }); }

  const tileTime = 0.5 * (1 + customers.length / 150); // crowds walk slower
  const qlen = (id: string) => customers.filter((c) => c.co === id && (c.phase === "QUEUING" || c.phase === "CHECKOUT")).length;
  for (const c of customers) {
    if (c.phase === "ENTERING" || c.phase === "SHOPPING" || c.phase === "LEAVING") c.t -= dt;
    if (c.phase === "ENTERING" && c.t <= 0) {
      // plan the trip: reachable shelves only, nearest-neighbour order, then walk to a checkout
      const picks = aisles.filter((a) => a.level > 0 && isFinite(L.dist.E[a.id]) && Math.random() < a.demandRate).sort(() => Math.random() - 0.5).slice(0, 2 + s.tier);
      const cks = active.filter((k) => isFinite(L.dist.E[k.id]));
      let at = "E", tiles = 0; const order: string[] = [];
      while (picks.length) { picks.sort((p, q) => L.dist[at][p.id] - L.dist[at][q.id]); const n = picks.shift()!; if (isFinite(L.dist[at][n.id])) { tiles += L.dist[at][n.id]; at = n.id; order.push(n.id); } }
      const back = Math.min(...cks.map((k) => L.dist[at][k.id]));
      const secs = (tiles + (isFinite(back) ? back : 0)) * tileTime + order.length * 1.0 + 1;
      if (!cks.length || !isFinite(back) || secs > 40) { c.phase = "LEAVING"; c.t = 1; c.mood = "😡"; } // no route, or lost patience
      else { c.phase = "SHOPPING"; c.plan = order; c.t = secs; c.mood = "🛒"; }
    } else if (c.phase === "SHOPPING" && c.t <= 0) {
      let oos = false;
      for (const id of c.plan) { const a = aisles.find((x) => x.id === id); if (!a) continue;
        if (a.stock >= a.stockConsumptionRate) { a.stock -= a.stockConsumptionRate; c.basket += E.getAisleRevenue(a.baseRevenue, a.level) * (L.boost[id] ?? 1); cogs += a.stockConsumptionRate * unitCost(a.type); } else oos = true; }
      const last = L.dist[c.plan[c.plan.length - 1]] ? c.plan[c.plan.length - 1] : "E";
      const open = active.filter((k) => qlen(k.id) < k.queueCapacity && isFinite(L.dist[last][k.id])).sort((x, y) => qlen(x.id) + L.dist[last][x.id] * 0.25 - (qlen(y.id) + L.dist[last][y.id] * 0.25))[0];
      if (c.basket <= 0) { c.phase = "LEAVING"; c.t = 1; c.mood = oos ? "❗" : "😐"; }
      else if (!open) { c.phase = "LEAVING"; c.t = 1; c.basket = 0; c.mood = "😡"; }
      else { c.phase = "QUEUING"; c.co = open.id; c.mood = "💵"; }
    } else if (c.phase === "QUEUING") { c.wait += dt; if (c.wait > 12) c.mood = "😡"; }
  }
  for (const k of active) {
    let cur = customers.find((c) => c.co === k.id && c.phase === "CHECKOUT");
    if (!cur) { cur = customers.find((c) => c.co === k.id && c.phase === "QUEUING"); if (cur) { cur.phase = "CHECKOUT"; k.currentCustomerProgress = 0; } }
    if (!cur) { k.currentCustomerProgress = 0; continue; }
    k.currentCustomerProgress += dt / k.processingTime;
    if (k.currentCustomerProgress >= 1) {
      cash += cur.basket; revenue += cur.basket; lifetimeRevenue += cur.basket; totalCustomersServed++; k.customersProcessed++;
      floats.push({ id: nextId++, amt: cur.basket, age: 0 });
      cur.phase = "LEAVING"; cur.t = 1; cur.mood = "💚"; cur.co = null; cur.basket = 0; k.currentCustomerProgress = 0;
    }
  }
  customers = customers.filter((c) => c.phase !== "LEAVING" || c.t > 0);
  // deliveries arrive in the storeroom; standing orders reorder automatically when total stock runs low
  for (const o of orders) if (o.eta <= 0) storeroom[o.type] += o.qty;
  orders = orders.filter((o) => o.eta > 0);
  for (const t of AISLE_ORDER) {
    const st = s.standing[t], sh = aisles.filter((a) => a.type === t && a.level > 0);
    if (!st?.on || !sh.length) continue;
    const cap = sh.reduce((n, a) => n + a.maxStock, 0), have = sh.reduce((n, a) => n + a.stock, 0) + storeroom[t] + orders.filter((o) => o.type === t).reduce((n, o) => n + o.qty, 0); // inbound counts
    if (have >= st.below * cap) continue;
    let q = st.qty, cost = orderCost(t, q);
    if (cash < cost) { q = Math.floor(cash / unitCost(t)); while (q > 0 && orderCost(t, q) > cash) q--; cost = orderCost(t, q); } // low on cash: buy what you can afford
    if (q >= Math.min(10, st.qty)) { cash -= cost; orders.push({ id: nextId++, type: t, qty: q, eta: DELIVERY_TIME, cost }); }
  }
  if (cash < 30 && orders.length === 0 && aisles.every((a) => a.stock <= 0) && AISLE_ORDER.every((t) => storeroom[t] <= 0)) storeroom.produce += 30; // safety net against a dead store
  for (const r of restockers) {
    if (r.level < 1) continue;
    r.currentCooldown = Math.max(0, r.currentCooldown - dt);
    const a = r.assignedAisleId ? aisles.find((x) => x.id === r.assignedAisleId) : aisles.filter((x) => x.level > 0 && x.stock < x.maxStock && storeroom[x.type] > 0).sort((p, q) => p.stock / p.maxStock - q.stock / q.maxStock)[0]; // null = Auto: emptiest shelf
    if (r.currentCooldown <= 0 && a && a.level > 0 && a.stock < a.maxStock && storeroom[a.type] > 0) { const n = Math.min(r.restockAmount, a.maxStock - a.stock, storeroom[a.type]); a.stock += n; storeroom[a.type] -= n; r.currentCooldown = r.cooldown; }
  }
  const eps = E.calculateEPS(s.earningsPerSecond, revenue - cogs, dt);
  return { ...s, aisles, checkouts, restockers, customers, floats, storeroom, orders, cash, lifetimeRevenue, totalCustomersServed, nextId, spawnAcc, earningsPerSecond: eps };
}

export function storeStatus(s: SimData) {
  const act = s.aisles.filter((a) => a.level > 0), ck = s.checkouts.filter((c) => c.level > 0), rs = s.restockers.filter((r) => r.level > 0);
  const inQ = s.customers.filter((c) => c.phase === "QUEUING" || c.phase === "CHECKOUT").length, cap = ck.reduce((n, c) => n + c.queueCapacity, 0) || 1;
  const throughput = ck.reduce((n, c) => n + 1 / c.processingTime, 0);
  const demand = demandOf(s), inv = act.length ? act.reduce((n, a) => n + a.stock / a.maxStock, 0) / act.length : 0;
  const autos = rs.filter((r) => !r.assignedAisleId).length, covered = act.length ? Math.min(1, (act.filter((a) => rs.some((r) => r.assignedAisleId === a.id)).length + autos) / act.length) : 0;
  const meters = { demand: Math.min(1, demand / Math.max(0.01, throughput)), checkout: Math.min(1, inQ / cap), inventory: inv, restocking: covered };
  let b: Bottleneck = "NORMAL";
  if (act.some((a) => a.stock <= 0)) b = covered < 1 ? "RESTOCK BOTTLENECK" : "LOW STOCK";
  else if (meters.checkout > 0.8) b = "CHECKOUT BOTTLENECK";
  else if (demand > throughput * 1.2) b = "CUSTOMER DEMAND EXCEEDS CAPACITY";
  else if (inv < 0.25) b = "LOW STOCK";
  return { meters, bottleneck: b, inQ };
}

import { getPlaceCost } from "./economy";
import { ItemKind, AisleType, Order, Standing } from "@/types/game";
export function placeCost(s: SimData, kind: ItemKind, type?: AisleType, offset = 0): number {
  if (kind === "aisle" && type) return getPlaceCost(AISLE_DEFS[type].cost, s.aisles.filter((a) => a.type === type).length + offset);
  if (kind === "decor") return getPlaceCost(200, s.decors.length + offset, 1.5);
  return kind === "checkout" ? getPlaceCost(CHECKOUT.place, s.checkouts.length + offset) : getPlaceCost(RESTOCK.place, s.restockers.length + offset);
}

export const defaultSupply = () => ({
  storeroom: Object.fromEntries(AISLE_ORDER.map((t) => [t, t === "produce" ? 100 : 0])) as Record<AisleType, number>,
  orders: [] as Order[],
  standing: Object.fromEntries(AISLE_ORDER.map((t) => [t, { on: true, below: 0.6, qty: 100 }])) as Record<AisleType, Standing>,
});
/** Unit cost is 40% of the base revenue each unit earns; bulk orders get a discount. */
export const unitCost = (t: AisleType) => (AISLE_DEFS[t].rev / AISLE_DEFS[t].use) * 0.4;
export const orderCost = (t: AisleType, qty: number) => Math.ceil(qty * unitCost(t) * (qty >= 300 ? 0.8 : qty >= 100 ? 0.9 : 1));

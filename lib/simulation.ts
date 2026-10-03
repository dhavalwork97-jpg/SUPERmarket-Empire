import { AISLE_DEFS, CHECKOUT, RESTOCK, AISLE_MULT, BASE_DEMAND, MAX_CUSTOMERS, TIERS, AISLE_ORDER, DELIVERY_TIME, PEOPLE_PER_TILE } from "./constants";
import * as E from "./economy";
import { AisleState, Bottleneck, CheckoutState, Customer, Fx, FxKind, RestockerState, SimData, Walker } from "@/types/game";
import { CUSTOMERS, rollKind } from "./customers";
import { EVENTS, rollEvent, DAY_SECONDS } from "./events";
import { cashierByLane, managerBonus, restockerWage, wagePerSecond, rederiveAll } from "./staff";
import { levelOf, xpForSale } from "./progress";
import { analyzeStore, Layout, Pt, findRoute, advance, WALK_SPEED, doorOf, entranceTile, streetPoint, isFree, tileOf } from "./navigation";

/** Fields added after the first save format. Used by new games, the loader (for old saves) and the balance bot. */
export const defaultExtras = () => ({ xp: 0, staff: [] as SimData["staff"], lifetimeExpenses: 0, satisfaction: 0.8, cleanliness: 1, clock: 0, event: null as SimData["event"], objectiveStep: 0,
  achievements: [] as string[], thefts: 0, theftsPrevented: 0, gems: 0, cosmetics: [] as string[], adsRemoved: false, revPerSec: 0, expPerSec: 0, recentThief: 0, recentBalk: 0, fx: [] as Fx[], crew: [] as Walker[] });
export const THEFT_CHANCE = 0.02;
export const demandMult = (s: SimData) => (0.85 + 0.15 * s.cleanliness) * (0.85 + 0.15 * s.satisfaction) * (s.event ? EVENTS[s.event.id]?.demand ?? 1 : 1);

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
/** Comfortable headcount: PEOPLE_PER_TILE shoppers per tile of floor (never above the hard simulation cap). */
export const storeCapacity = (s: SimData) => Math.min(MAX_CUSTOMERS, Math.round(tierOf(s).cols * tierOf(s).rows * PEOPLE_PER_TILE));
/** What draws shoppers in is what they can see on the shelves. Checkout and restocker levels used to count too, so every till or crate-runner upgrade also raised footfall. */
export const appealOf = (s: SimData) => s.aisles.reduce((n, a) => n + Math.max(0, a.level), 0);
export const demandOf = (s: SimData) => E.getCustomerDemand(appealOf(s), BASE_DEMAND) * TIERS[Math.min(s.tier, TIERS.length - 1)].demand;

export type { Layout } from "./navigation";
const tierOf = (s: SimData) => TIERS[Math.min(s.tier, TIERS.length - 1)];
/**
 * Walkable-space analysis of the store the player has actually built (see lib/navigation.ts). Everything the player places occupies its tile; routes,
 * reachability, queue positions and decor boosts all come from that one grid, and it is rebuilt only when the layout changes.
 */
export function analyzeLayout(s: SimData): Layout {
  const { cols, rows } = tierOf(s);
  return analyzeStore(cols, rows, s.aisles, s.checkouts, s.restockers, s.decors);
}

const hash01 = (a: number, b: number) => { let x = Math.imul((a ^ 0x9e3779b9) | 0, 2654435761) ^ Math.imul((b + 0x85ebca6b) | 0, 2246822519); x = Math.imul(x ^ (x >>> 15), 2246822519) >>> 0; return (x % 100000) / 100000; };
const idNum = (id: string) => { let h = 7; for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619); return h | 0; };
/**
 * Roaming staff. Cosmetic only (cash, stock and queues never read this), but they use the very same router as shoppers so nobody on the floor walks
 * through a shelf: cleaners wander open floor, guards hang around the door, the manager visits shelves and tills, restockers run crates to the shelf
 * they just filled and back to their desk.
 */
function stepCrew(s: SimData, L: Layout, dt: number, aisles: AisleState[], restockers: RestockerState[], staff: SimData["staff"], fired: Map<string, string>, rows: number): Walker[] {
  const ent = entranceTile(rows), step = WALK_SPEED * 0.9 * dt, old = new Map(s.crew.map((w) => [w.id, w]));
  const want: { id: string; role: Walker["role"]; desk?: RestockerState }[] = [...restockers.filter((r) => r.level > 0).map((r) => ({ id: "r" + r.id, role: "restocker" as const, desk: r })),
    ...staff.filter((x) => x.role === "cleaner" || x.role === "security" || x.role === "manager").map((x) => ({ id: "s" + x.id, role: (x.role === "security" ? "guard" : x.role) as Walker["role"] }))];
  return want.map((m) => {
    const home = m.desk ? L.access["desk" + m.desk.id]?.[0] : undefined;
    const w: Walker = old.has(m.id) ? { ...old.get(m.id)! } : { id: m.id, role: m.role, x: home?.x ?? m.desk?.x ?? ent.x, y: home?.y ?? m.desk?.y ?? ent.y, path: [], pi: 0, goal: "", nav: -1, wait: 0, turn: 0, task: "idle" };
    const seed = idNum(m.id);
    const go = (key: string, targets: Pt[]) => { if (w.goal === key && w.nav === L.version) return; const r = findRoute(L.grid, w, targets); w.goal = key; w.nav = L.version; w.path = r ? r.path : []; w.pi = 0; };
    const walk = () => { const a = advance(w.x, w.y, w.path, w.pi, step); if (a.x !== w.x || a.y !== w.y) w.face = { x: a.x - w.x, y: a.y - w.y }; w.x = a.x; w.y = a.y; w.pi = a.pi; return a.done; };
    if (m.role === "restocker") {
      const job = fired.get(m.desk!.id); if (job) { w.task = "to:" + job; w.goal = ""; w.wait = 0; }
      if (w.task?.startsWith("to:")) { const id = w.task.slice(3), sh = aisles.find((a) => a.id === id);
        if (!sh) w.task = "home"; else { go(w.task + "@" + sh.x + "," + sh.y, L.access[id] ?? []); if (walk() || !w.path.length) { w.task = "work:" + id; w.wait = 1; w.face = { x: sh.x - w.x, y: sh.y - w.y }; } } }
      else if (w.task?.startsWith("work:")) { w.wait -= dt; if (w.wait <= 0) { w.task = "home"; w.goal = ""; } }
      else { if (home) { go("home", [home]); walk(); } }
    } else {
      if (w.task === "walk") { if (walk() || !w.path.length) { w.task = "idle"; w.wait = m.role === "guard" ? 4 : m.role === "manager" ? 3 : 2.5; } }
      else { w.wait -= dt; if (w.wait <= 0) {
        w.turn++; let targets: Pt[] = [];
        if (m.role === "cleaner") { const t = L.floor[Math.floor(hash01(seed, w.turn) * L.floor.length)]; targets = t ? [t] : []; }
        else if (m.role === "guard") { const near = L.floor.filter((t) => Math.max(Math.abs(t.x - ent.x), Math.abs(t.y - ent.y)) <= 3), t = near[Math.floor(hash01(seed, w.turn) * near.length)]; targets = t ? [t] : []; }
        else { const items = [...aisles.filter((a) => a.level > 0), ...s.checkouts.filter((k) => k.level > 0)]; const it = items[w.turn % Math.max(1, items.length)]; targets = it ? L.access[it.id] ?? [] : []; }
        go(m.role + w.turn, targets); w.task = "walk"; if (!w.path.length) { w.task = "idle"; w.wait = 2; } } }
    }
    return w;
  });
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
  const fx: Fx[] = s.fx.map((f) => ({ ...f, age: f.age + dt })).filter((f) => f.age < 4);
  const say = (kind: FxKind, text: string) => { if (fx.length < 8 && !fx.some((f) => f.text === text)) fx.push({ id: nextId++, kind, text, age: 0 }); };
  let { xp, thefts, theftsPrevented, satisfaction, cleanliness, clock, event } = s, happy = 0, angry = 0, recentThief = Math.max(0, s.recentThief - dt), recentBalk = Math.max(0, s.recentBalk - dt);
  const staff = s.staff.map((x) => ({ ...x })), lanes = cashierByLane(staff, checkouts), mb = managerBonus(staff), ev = event ? EVENTS[event.id] : undefined;
  const secStop = Math.min(0.85, staff.filter((x) => x.role === "security").reduce((n, x) => n + x.efficiency, 0));
  const lvlBefore = levelOf(xp);
  clock += dt;
  if (Math.floor(clock / DAY_SECONDS) > Math.floor(s.clock / DAY_SECONDS)) { event = rollEvent(); if (event) say("event", `${EVENTS[event.id].name}: ${EVENTS[event.id].blurb}`); }
  else if (event) { event = { ...event, left: event.left - dt }; if (event.left <= 0) event = null; }
  const { rows } = tierOf(s), ent = entranceTile(rows), door = doorOf(rows), BROWSE = 1.0;
  const leave = (c: Customer, mood: string, say?: string) => { c.phase = "LEAVING"; c.mood = mood; c.co = null; c.goal = ""; c.path = []; c.pi = 0; c.lost = false; c.stuck = 0; c.dwell = 0; if (say) { c.say = say; c.sayT = 2.6; } };
  const active = checkouts.filter((c) => c.level > 0);
  const fired = new Map<string, string>();

  spawnAcc += demandOf(s) * demandMult({ ...s, event }) * dt;
  const room = storeCapacity(s); // a shop only holds so many people: when the floor is full, new arrivals look in and walk on
  while (spawnAcc >= 1) { spawnAcc -= 1; if (customers.length >= room) { recentBalk = 4; continue; } const st = streetPoint(rows, nextId);
    customers.push({ id: nextId++, phase: "ENTERING", kind: rollKind(s.tier, ev?.kinds), mood: "🚶", basket: 0, wait: 0, co: null, plan: [], stop: 0, dwell: 0, x: st.x, y: st.y, path: [door, ent], pi: 0, goal: "door", nav: L.version, lost: false, stuck: 0, qn: 0 }); }

  const step = (WALK_SPEED / (1 + customers.length / 150)) * dt; // crowds shuffle a little slower
  let repaths = 0; const REPATH_BUDGET = 48;      // after a layout change at most this many shoppers re-route per tick; the rest hold still (never walking an old route) until their turn
  const lane: Record<string, Customer[]> = {}; for (const k of active) lane[k.id] = [];
  for (const c of customers) if (c.co && lane[c.co] && (c.phase === "QUEUING" || c.phase === "CHECKOUT")) lane[c.co].push(c);
  for (const k in lane) lane[k].sort((a, b) => (a.phase === "CHECKOUT" ? -1 : 0) - (b.phase === "CHECKOUT" ? -1 : 0) || a.qn - b.qn);
  /** Make sure c has a route for `key` that was searched on the current layout, from where c stands now. False = hold position this tick. */
  const route = (c: Customer, key: string, targets: Pt[]): boolean => {
    if (c.goal === key && c.nav === L.version) return true;
    if (c.goal === key && repaths >= REPATH_BUDGET) return false;
    repaths++; const r = findRoute(L.grid, c, targets); c.goal = key; c.nav = L.version;
    if (r) { c.path = r.path; c.pi = 0; c.lost = false; } else { c.path = []; c.pi = 0; c.lost = true; }
    return true;
  };
  const walk = (c: Customer): boolean => { const a = advance(c.x, c.y, c.path, c.pi, step); if (a.x !== c.x || a.y !== c.y) c.face = { x: a.x - c.x, y: a.y - c.y }; c.x = a.x; c.y = a.y; c.pi = a.pi; return a.done; };
  const purchase = (c: Customer, id: string) => {
    const a = aisles.find((x) => x.id === id); if (!a) return; const def = CUSTOMERS[c.kind] ?? CUSTOMERS.normal;
    if (a.stock >= a.stockConsumptionRate) { a.stock -= a.stockConsumptionRate; c.basket += E.getAisleRevenue(a.baseRevenue, a.level) * (L.boost[id] ?? 1) * def.basket * (ev?.revenue?.[a.type] ?? 1); cogs += a.stockConsumptionRate * unitCost(a.type); c.mood = "🛒"; }
    else { c.oos = true; c.say = "Out of stock"; c.sayT = 2.2; }
  };
  /** End of the shopping trip: same decisions as before (nothing bought / no lane / shoplifter / join the shortest queue), now followed by a walk to the lane. */
  const finishShopping = (c: Customer) => {
    const def = CUSTOMERS[c.kind] ?? CUSTOMERS.normal, last = c.plan.length && L.dist[c.plan[c.plan.length - 1]] ? c.plan[c.plan.length - 1] : "E";
    const open = active.filter((k) => lane[k.id].length < Math.min(k.queueCapacity, def.maxQueue) && isFinite(L.dist[last][k.id]) && L.slots[k.id]?.length).sort((x, y) => lane[x.id].length + L.dist[last][x.id] * 0.25 - (lane[y.id].length + L.dist[last][y.id] * 0.25))[0];
    if (c.basket <= 0) { leave(c, c.oos ? "❗" : "😐"); if (c.oos) angry++; }
    else if (!open) { c.basket = 0; leave(c, "😡", active.length ? "Queues are too long" : "No checkout!"); angry++; }
    else if (Math.random() < THEFT_CHANCE * (1 + s.tier * 0.5)) { // shoplifter: a guard may stop them, otherwise the basket walks out
      recentThief = 3;
      if (Math.random() < secStop) { theftsPrevented++; say("stopped", "Security stopped a shoplifter!"); c.basket = 0; leave(c, "🛡️"); }
      else { thefts++; say("theft", `Shoplifter got away with ${"$" + Math.round(c.basket)}`); c.basket = 0; leave(c, "🦹"); }
    }
    else { c.phase = "QUEUING"; c.co = open.id; c.mood = "💵"; c.qn = nextId++; c.goal = ""; lane[open.id].push(c); }
  };

  for (const c of customers) {
    if (c.sayT !== undefined) { c.sayT -= dt; if (c.sayT <= 0) { c.sayT = undefined; c.say = undefined; } }
    // the player built on the tile someone is standing on (till-side, or browsing a shelf): move them on rather than leave them inside the furniture
    if ((c.phase === "CHECKOUT" || (c.phase === "SHOPPING" && c.dwell > 0)) && c.nav !== L.version && !isFree(L.grid, tileOf(c.x), tileOf(c.y))) { if (c.phase === "CHECKOUT") c.phase = "QUEUING"; c.dwell = 0; c.goal = ""; }
    if (c.phase === "ENTERING") {
      if (!walk(c)) continue;
      // inside the door: plan the trip on the layout as it is right now. Only shelves/lanes a person can actually reach are candidates.
      const def = CUSTOMERS[c.kind] ?? CUSTOMERS.normal, seen = aisles.filter((a) => a.level > 0), reach = seen.filter((a) => isFinite(L.dist.E[a.id]));
      const picks = reach.filter((a) => Math.random() < Math.min(1, a.demandRate * def.want(a))).sort(() => Math.random() - 0.5).slice(0, 2 + s.tier);
      if (def.impulse && Math.random() < def.impulse) { const extra = reach.filter((a) => !picks.includes(a)); if (extra.length) picks.push(extra[Math.floor(Math.random() * extra.length)]); }
      const cks = active.filter((k) => isFinite(L.dist.E[k.id]) && L.slots[k.id]?.length);
      let at = "E", tiles = 0; const order: string[] = [];
      while (picks.length) { picks.sort((p, q) => L.dist[at][p.id] - L.dist[at][q.id]); const n = picks.shift()!; if (isFinite(L.dist[at][n.id])) { tiles += L.dist[at][n.id]; at = n.id; order.push(n.id); } }
      const back = Math.min(...cks.map((k) => L.dist[at][k.id]));
      const secs = (tiles + (isFinite(back) ? back : 0)) / (WALK_SPEED / (1 + customers.length / 150)) + order.length * BROWSE + 1;
      if (!cks.length || !isFinite(back) || secs > 90) { leave(c, "😡", !cks.length ? (active.length ? "Can't reach checkout" : "No checkout!") : seen.length && !reach.length ? "Can't reach shelf" : "This is too far"); angry++; }
      else { c.phase = "SHOPPING"; c.plan = order; c.stop = 0; c.dwell = 0; c.mood = "🛒"; c.goal = ""; }
    } else if (c.phase === "SHOPPING") {
      if (c.dwell > 0) { c.dwell -= dt; if (c.dwell <= 0) { purchase(c, c.plan[c.stop]); c.stop++; c.goal = ""; } continue; }
      const id = c.plan[c.stop]; if (id === undefined) { finishShopping(c); continue; }
      const a = aisles.find((x) => x.id === id); if (!a || a.level < 1) { c.stop++; c.goal = ""; continue; }
      if (!route(c, `s${id}@${a.x},${a.y}`, L.access[id] ?? [])) continue;
      if (c.lost) { c.say = "Can't reach shelf"; c.sayT = 2.6; c.stop++; c.goal = ""; angry++; continue; } // layout changed under them: skip it, keep shopping
      if (walk(c)) { c.dwell = BROWSE; c.face = { x: a.x - c.x, y: a.y - c.y }; }
    } else if (c.phase === "QUEUING") {
      c.wait += dt; if (c.wait > 12) c.mood = "😡";
      const pat = (CUSTOMERS[c.kind] ?? CUSTOMERS.normal).patience; if (c.wait > pat) { c.basket = 0; leave(c, "😡", "Too slow!"); angry++; continue; }
      const slots = c.co ? L.slots[c.co] : undefined, rank = Math.max(0, lane[c.co ?? ""]?.indexOf(c) ?? 0), t = slots?.[Math.min(rank, (slots?.length ?? 1) - 1)];
      if (!t) { c.basket = 0; leave(c, "😡", "Can't reach checkout"); angry++; continue; }
      if (!route(c, `q${c.co}#${rank}@${t.x.toFixed(2)},${t.y.toFixed(2)}`, [t])) continue;
      if (c.lost) { c.stuck += dt; if (c.stuck > 5) { c.basket = 0; leave(c, "😡", "Can't reach checkout"); angry++; } continue; }
      walk(c);
    } else if (c.phase === "LEAVING") {
      if (c.goal !== "out" && c.goal !== "away") {
        if (c.y > rows - 0.5) { c.path = [streetPoint(rows, c.id + 7)]; c.pi = 0; c.goal = "away"; }
        else {
          if (!route(c, "exit", [ent])) continue;
          if (c.lost) { c.stuck += dt; if (c.stuck > 8) { c.gone = true; angry++; } continue; }   // walled in with no way out: give up after a while rather than phase through geometry
          if (walk(c)) { c.path = [door, streetPoint(rows, c.id + 7)]; c.pi = 0; c.goal = "out"; }
          continue;
        }
      }
      if (walk(c)) c.gone = true;
    }
  }
  for (const k of active) {
    let cur = lane[k.id].find((c) => c.phase === "CHECKOUT");
    if (!cur) { const first = lane[k.id][0]; if (first && first.phase === "QUEUING" && !first.lost && first.pi >= first.path.length && first.goal.startsWith(`q${k.id}#0@`)) { cur = first; cur.phase = "CHECKOUT"; k.currentCustomerProgress = 0; } } // the next shopper must have actually reached the till
    if (!cur) { k.currentCustomerProgress = 0; continue; }
    const cashier = lanes[k.id], speed = cashier ? cashier.efficiency : 1;
    k.currentCustomerProgress += (dt * speed) / k.processingTime;
    if (k.currentCustomerProgress >= 1) {
      cash += cur.basket; revenue += cur.basket; lifetimeRevenue += cur.basket; totalCustomersServed++; k.customersProcessed++;
      floats.push({ id: nextId++, amt: cur.basket, age: 0, x: k.x, y: k.y });
      xp += xpForSale(cur.basket); happy++;
      leave(cur, "💚"); cur.basket = 0; k.currentCustomerProgress = 0;
    }
  }
  customers = customers.filter((c) => !c.gone);
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
    r.currentCooldown = Math.max(0, r.currentCooldown - dt * mb); r.busy = Math.max(0, (r.busy ?? 0) - dt); r.salary = restockerWage(r.level, s.tier);
    const a = r.assignedAisleId ? aisles.find((x) => x.id === r.assignedAisleId) : aisles.filter((x) => x.level > 0 && x.stock < x.maxStock && storeroom[x.type] > 0).sort((p, q) => p.stock / p.maxStock - q.stock / q.maxStock)[0]; // null = Auto: emptiest shelf
    if (r.currentCooldown <= 0 && a && a.level > 0 && a.stock < a.maxStock && storeroom[a.type] > 0) { const n = Math.min(Math.max(1, Math.round(r.restockAmount * AISLE_DEFS[a.type].restock)), a.maxStock - a.stock, storeroom[a.type]); a.stock += n; storeroom[a.type] -= n; r.currentCooldown = r.cooldown; r.busy = 2.4; r.target = a.id; fired.set(r.id, a.id); }
    const hasWork = !!(a && a.level > 0 && a.stock < a.maxStock && storeroom[a.type] > 0); r.workload = (r.workload ?? 0) + ((hasWork || r.busy > 0 ? 1 : 0) - (r.workload ?? 0)) * Math.min(1, dt / 4);
  }
  // running costs: wages + store upkeep (never push cash below zero)
  const wage = Math.min(cash, wagePerSecond(staff, restockers, s.tier) * dt); cash -= wage;
  // cleanliness: customers make a mess, cleaners mop it up
  cleanliness = Math.min(1, Math.max(0, cleanliness - 0.0004 * Math.sqrt(customers.length) * dt + staff.filter((x) => x.role === "cleaner").reduce((n, x) => n + x.efficiency, 0) * 0.01 * dt));
  satisfaction = Math.min(1, Math.max(0, satisfaction + happy * 0.02 - angry * 0.04 + (cleanliness - 0.6) * 0.002 * dt));
  // staff workload (0..1, smoothed) so the UI can show who is busy
  const sm = (v: number, t: number) => v + (t - v) * Math.min(1, dt / 4), others = staff.filter((x) => x.role !== "manager");
  for (const x of staff) {
    const lane = x.role === "cashier" ? Object.keys(lanes).find((id) => lanes[id].id === x.id) : undefined;
    const t = x.role === "cashier" ? (lane && customers.some((c) => c.co === lane) ? 1 : 0) : x.role === "cleaner" ? 1 - cleanliness : x.role === "security" ? Math.min(1, customers.length / 25 + recentThief / 3) : others.length ? others.reduce((n, o) => n + o.workload, 0) / others.length : 0;
    x.workload = sm(x.workload, t);
  }
  // alerts + level-up
  for (const a of aisles) { const p = s.aisles.find((z) => z.id === a.id); if (!p || a.level < 1) continue; const nm = `${AISLE_DEFS[a.type].name} #${a.id.slice(1)}`;
    if (p.stock > 0 && a.stock <= 0) say("oos", `Out of stock: ${nm}`); else if (p.stock >= 0.25 * p.maxStock && a.stock < 0.25 * a.maxStock && a.stock > 0) say("low", `Low stock: ${nm}`); }
  const lvlAfter = levelOf(xp); if (lvlAfter > lvlBefore) say("level", `LEVEL UP! You are now level ${lvlAfter}`);
  const eps = E.calculateEPS(s.earningsPerSecond, revenue - cogs - wage, dt);
  const revPerSec = E.calculateEPS(s.revPerSec, revenue, dt), expPerSec = E.calculateEPS(s.expPerSec, wage, dt);
  const crew = stepCrew(s, L, dt, aisles, restockers, staff, fired, rows);
  return { ...s, aisles, checkouts, restockers, customers, crew, floats, fx, staff, xp, thefts, theftsPrevented, satisfaction, cleanliness, clock, event, recentThief, recentBalk, lifetimeExpenses: s.lifetimeExpenses + wage, storeroom, orders, cash, lifetimeRevenue, totalCustomersServed, nextId, spawnAcc, earningsPerSecond: eps, revPerSec, expPerSec };
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

export type Alert = { id: string; icon: "alert" | "wait" | "restock" | "angry" | "coin"; text: string; tone: "bad" | "warn" };
/** Plain-language list of what needs the player's attention, derived only from live state. */
export function storeAlerts(s: SimData): Alert[] {
  const out: Alert[] = [], act = s.aisles.filter((a) => a.level > 0);
  for (const a of act) { const nm = AISLE_DEFS[a.type].name; const room = s.storeroom[a.type] + s.orders.filter((o) => o.type === a.type).reduce((n, o) => n + o.qty, 0);
    if (a.stock <= 0) out.push({ id: `o${a.id}`, icon: "alert", tone: "bad", text: `${nm} #${a.id.slice(1)} is OUT OF STOCK${room > 0 ? "" : ": order more in Supply"}` });
    else if (a.stock < 0.25 * a.maxStock) out.push({ id: `l${a.id}`, icon: "restock", tone: "warn", text: `${nm} #${a.id.slice(1)} is low (${Math.floor(a.stock)}/${a.maxStock})` }); }
  const L = analyzeLayout(s);
  for (const k of s.checkouts) { const q = s.customers.filter((c) => c.co === k.id).length; if (k.level > 0 && q >= k.queueCapacity) out.push({ id: `q${k.id}`, icon: "wait", tone: "warn", text: `Checkout #${k.id.slice(1)} queue is full: add a lane or a cashier` }); }
  for (const i of [...s.aisles, ...s.checkouts]) if (!isFinite(L.dist.E?.[i.id])) { out.push({ id: `b${i.id}`, icon: "alert", tone: "bad", text: "Something is blocked off: customers cannot reach it" }); break; }
  if (s.cleanliness < 0.35) out.push({ id: "dirty", icon: "angry", tone: "warn", text: "The store is getting dirty: hire a cleaner" });
  if (s.recentBalk > 0) out.push({ id: "full", icon: "wait", tone: "warn", text: "Store is full: shoppers are turned away at the door" });
  if (s.satisfaction < 0.4) out.push({ id: "sat", icon: "angry", tone: "bad", text: "Customers are unhappy: check queues and stock" });
  if (s.cash < 10 && s.customers.length === 0) out.push({ id: "broke", icon: "coin", tone: "bad", text: "Out of cash" });
  return out;
}
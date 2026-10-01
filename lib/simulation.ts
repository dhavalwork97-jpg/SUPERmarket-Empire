import { AISLE_DEFS, CHECKOUT, RESTOCK, AISLE_MULT, BASE_DEMAND, MAX_CUSTOMERS } from "./constants";
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
export const demandOf = (s: SimData) => E.getCustomerDemand(storeLevel(s), BASE_DEMAND);

export function simulate(s: SimData, dt: number): SimData {
  const aisles = s.aisles.map((a) => ({ ...a })), checkouts = s.checkouts.map((c) => ({ ...c })), restockers = s.restockers.map((r) => ({ ...r }));
  let customers: Customer[] = s.customers.map((c) => ({ ...c }));
  let { cash, lifetimeRevenue, totalCustomersServed, nextId, spawnAcc } = s;
  let revenue = 0;
  const floats = s.floats.map((f) => ({ ...f, age: f.age + dt })).filter((f) => f.age < 1.5);
  const active = checkouts.filter((c) => c.level > 0);

  spawnAcc += demandOf(s) * dt;
  while (spawnAcc >= 1) { spawnAcc -= 1; if (customers.length < MAX_CUSTOMERS) customers.push({ id: nextId++, phase: "ENTERING", t: 1, wait: 0, basket: 0, co: null, mood: "🚶" }); }

  const qlen = (id: string) => customers.filter((c) => c.co === id && (c.phase === "QUEUING" || c.phase === "CHECKOUT")).length;
  for (const c of customers) {
    if (c.phase === "ENTERING" || c.phase === "SHOPPING" || c.phase === "LEAVING") c.t -= dt;
    if (c.phase === "ENTERING" && c.t <= 0) { c.phase = "SHOPPING"; c.t = rnd(2, 5); c.mood = "🛒"; }
    else if (c.phase === "SHOPPING" && c.t <= 0) {
      let oos = false;
      for (const a of aisles) {
        if (a.level < 1 || Math.random() > a.demandRate) continue;
        if (a.stock >= a.stockConsumptionRate) { a.stock -= a.stockConsumptionRate; c.basket += E.getAisleRevenue(a.baseRevenue, a.level); } else oos = true;
      }
      const open = active.filter((k) => qlen(k.id) < k.queueCapacity).sort((x, y) => qlen(x.id) - qlen(y.id))[0];
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
  for (const r of restockers) {
    if (r.level < 1) continue;
    r.currentCooldown = Math.max(0, r.currentCooldown - dt);
    const a = aisles.find((x) => x.id === r.assignedAisleId);
    if (r.currentCooldown <= 0 && a && a.level > 0 && a.stock < a.maxStock) { a.stock = Math.min(a.maxStock, a.stock + r.restockAmount); r.currentCooldown = r.cooldown; }
  }
  const eps = E.calculateEPS(s.earningsPerSecond, revenue, dt);
  return { ...s, aisles, checkouts, restockers, customers, floats, cash, lifetimeRevenue, totalCustomersServed, nextId, spawnAcc, earningsPerSecond: eps };
}

export function storeStatus(s: SimData) {
  const act = s.aisles.filter((a) => a.level > 0), ck = s.checkouts.filter((c) => c.level > 0), rs = s.restockers.filter((r) => r.level > 0);
  const inQ = s.customers.filter((c) => c.phase === "QUEUING" || c.phase === "CHECKOUT").length, cap = ck.reduce((n, c) => n + c.queueCapacity, 0) || 1;
  const throughput = ck.reduce((n, c) => n + 1 / c.processingTime, 0);
  const demand = demandOf(s), inv = act.length ? act.reduce((n, a) => n + a.stock / a.maxStock, 0) / act.length : 0;
  const covered = act.length ? act.filter((a) => rs.some((r) => r.assignedAisleId === a.id)).length / act.length : 0;
  const meters = { demand: Math.min(1, demand / Math.max(0.01, throughput)), checkout: Math.min(1, inQ / cap), inventory: inv, restocking: covered };
  let b: Bottleneck = "NORMAL";
  if (act.some((a) => a.stock <= 0)) b = covered < 1 ? "RESTOCK BOTTLENECK" : "LOW STOCK";
  else if (meters.checkout > 0.8) b = "CHECKOUT BOTTLENECK";
  else if (demand > throughput * 1.2) b = "CUSTOMER DEMAND EXCEEDS CAPACITY";
  else if (inv < 0.25) b = "LOW STOCK";
  return { meters, bottleneck: b, inQ };
}

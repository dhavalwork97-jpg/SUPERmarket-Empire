/** Run with: npm test. Plain asserts, no test framework needed. */
import assert from "node:assert/strict";
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
import { simulate, defaultExtras, defaultSupply, deriveAisle, deriveCheckout, deriveRestocker, storeAlerts } from "../lib/simulation";
import { levelOf, xpForLevel, OBJECTIVES, objectiveAt } from "../lib/progress";
import { deriveStaff, rederiveAll, canHire, cashierByLane } from "../lib/staff";
import { CUSTOMERS, CUSTOMER_KINDS } from "../lib/customers";
import { SimData, Customer } from "../types/game";
import { SAVE_KEY } from "../lib/constants";
import { useGame } from "../store/store";
let n = 0; const t = (name: string, f: () => void) => { f(); n++; console.log("ok -", name); };
const mk = (): SimData => ({ cash: 500, tier: 0, lifetimeRevenue: 0, totalCustomersServed: 0, earningsPerSecond: 0, lastSavedTimestamp: 0, customers: [], floats: [], spawnAcc: 0, nextId: 1,
  aisles: [deriveAisle({ id: "a1", type: "produce", level: 1, stock: 100, maxStock: 0, baseRevenue: 0, demandRate: 0, stockConsumptionRate: 0, upgradeCost: 0, x: 1, y: 0 })],
  checkouts: [deriveCheckout({ id: "c1", level: 1, processingTime: 0, queueCapacity: 0, currentCustomerProgress: 0, customersProcessed: 0, upgradeCost: 0, x: 2, y: 3 }, 0)],
  decors: [], ...defaultSupply(), ...defaultExtras(), restockers: [deriveRestocker({ id: "r1", level: 1, restockAmount: 0, cooldown: 0, currentCooldown: 0, assignedAisleId: null, upgradeCost: 0, x: 0, y: 1 }, 0)] });
const run = (s: SimData, secs: number) => { for (let i = 0; i < secs * 10; i++) s = simulate(s, 0.1); return s; };
const cust = (o: Partial<Customer>): Customer => ({ id: 1, phase: "SHOPPING", kind: "normal", mood: "🛒", basket: 0, wait: 0, co: null, plan: [], stop: 0, dwell: 0, x: 0, y: 3, path: [], pi: 0, goal: "", nav: -1, lost: false, stuck: 0, qn: 0, ...o });
const staffOf = (role: any, level = 1) => deriveStaff({ id: "s1", role, level, efficiency: 1, workload: 0, salary: 0, upgradeCost: 0 }, 0);

t("level curve is monotonic and consistent", () => { for (let l = 1; l < 40; l++) { assert.equal(levelOf(xpForLevel(l)), l); assert.equal(levelOf(xpForLevel(l + 1) - 1), l); } });
t("customers shop, pay, deplete stock and earn XP + money", () => { const s = run(mk(), 120); assert.ok(s.totalCustomersServed > 5); assert.ok(s.lifetimeRevenue > 0); assert.ok(s.xp > 0); assert.ok(s.aisles[0].stock < 100 || s.storeroom.produce < 100); });
t("wages and upkeep are charged and cash never goes negative", () => { let s = mk(); s.staff = rederiveAll([staffOf("manager", 3)], 0); s.cash = 1; s = run({ ...s, spawnAcc: 0 }, 30); assert.ok(s.cash >= 0); assert.ok(s.lifetimeExpenses > 0); });
t("simulation is deterministic about state shape (no NaN)", () => { const s = run(mk(), 200); for (const k of ["cash", "xp", "satisfaction", "cleanliness", "earningsPerSecond", "revPerSec", "expPerSec"] as const) assert.ok(Number.isFinite(s[k] as number), k); assert.ok(s.satisfaction >= 0 && s.satisfaction <= 1 && s.cleanliness >= 0 && s.cleanliness <= 1); });
t("cleaner keeps the store cleaner than no cleaner", () => { const base = mk(); base.customers = Array.from({ length: 25 }, (_, i) => cust({ id: i + 1000, dwell: 999 })); base.spawnAcc = 0;
  const a = run({ ...base, staff: [] }, 120), b = run({ ...base, staff: rederiveAll([staffOf("cleaner", 2)], 0) }, 120); assert.ok(b.cleanliness > a.cleanliness, `${b.cleanliness} vs ${a.cleanliness}`); });
t("cashier speeds up its lane", () => { const base = mk(); const c = rederiveAll([staffOf("cashier", 3)], 0); const lane = cashierByLane(c, base.checkouts); assert.ok(lane.c1 && lane.c1.efficiency > 1.3); assert.equal(Object.keys(cashierByLane([], base.checkouts)).length, 0); });
t("manager boosts other staff", () => { const alone = rederiveAll([staffOf("security", 2)], 0)[0].efficiency; const withMgr = rederiveAll([staffOf("security", 2), { ...staffOf("manager", 4), id: "s2" }], 0)[0].efficiency; assert.ok(withMgr > alone); });
t("hiring rules: level gate, slot cap, one cashier per lane", () => { assert.equal(canHire("manager", [], 0, 1, 1).ok, false); assert.equal(canHire("cashier", [], 0, 1, 2).ok, true);
  assert.equal(canHire("cashier", rederiveAll([staffOf("cashier")], 0), 0, 1, 9).ok, false); assert.equal(canHire("cleaner", [staffOf("cashier"), { ...staffOf("manager"), id: "s2" }], 0, 1, 9).ok, false); });
t("shoplifters: guards stop thefts, no guard lets them through", () => { const mkT = (staff: any[]) => { let s = mk(); s.tier = 2; s.staff = staff; s.aisles = s.aisles.map((a) => ({ ...a, stock: a.maxStock })); s.storeroom.produce = 1e6; return run(s, 600); };
  const none = mkT([]), guard = mkT(rederiveAll([staffOf("security", 6)], 2)); assert.ok(none.thefts > 0); assert.ok(guard.theftsPrevented > guard.thefts, `${guard.theftsPrevented} vs ${guard.thefts}`); });
t("impatient shoppers walk out of long queues", () => { const s = mk(); s.customers = Array.from({ length: 5 }, (_, i) => cust({ id: i + 1, phase: "QUEUING", basket: 20, co: "c1", mood: "💵", plan: ["a1"], kind: "impatient", qn: i + 1 })); s.checkouts[0].processingTime = 999;
  const r = run(s, 10); assert.ok(r.customers.filter((c) => c.phase === "QUEUING").length < 5); assert.ok(r.satisfaction < s.satisfaction); });
t("every customer type is fully defined", () => { for (const k of CUSTOMER_KINDS) { const d = CUSTOMERS[k]; assert.ok(d.name && d.basket > 0 && d.maxQueue > 0 && d.weight(0) > 0); } });
t("out-of-stock and low-stock alerts appear", () => { const s = mk(); s.aisles[0].stock = 0; assert.ok(storeAlerts(s).some((a) => a.text.includes("OUT OF STOCK"))); s.aisles[0].stock = 10; assert.ok(storeAlerts(s).some((a) => a.text.includes("low"))); });
t("objectives: ordered list is solvable, endless ladder keeps growing", () => { assert.ok(OBJECTIVES.length >= 20); const ids = new Set(OBJECTIVES.map((o) => o.id)); assert.equal(ids.size, OBJECTIVES.length);
  let prev = 0; for (let i = OBJECTIVES.length; i < OBJECTIVES.length + 12; i += 3) { const o = objectiveAt(i); assert.ok(o.target > prev); prev = o.target; } const s = mk(); assert.equal(objectiveAt(0).value(s) < objectiveAt(0).target, true); });
t("loads a pre-XP (v1) save and keeps everything", () => {
  store[SAVE_KEY] = JSON.stringify({ saveVersion: 1, cash: 1234, tier: 1, lifetimeRevenue: 5000, totalCustomersServed: 200, earningsPerSecond: 5, lastSavedTimestamp: Date.now(), aisles: [{ id: "a1", type: "produce", level: 4, stock: 50, x: 1, y: 0 }, { id: "a2", type: "bakery", level: 2, stock: 10, x: 2, y: 0 }],
    checkouts: [{ id: "c1", level: 3, x: 2, y: 3, customersProcessed: 40 }], restockers: [{ id: "r1", level: 2, x: 0, y: 1, assignedAisleId: "a1" }], decors: [], storeroom: { produce: 77, bakery: 0, electronics: 0, refrigerated: 0, freezer: 0, deli: 0 }, orders: [], standing: {} });
  useGame.getState().loadGame(); const g = useGame.getState();
  assert.equal(g.tier, 1); assert.equal(g.aisles.length, 2); assert.equal(g.aisles[0].level, 4); assert.equal(g.checkouts[0].level, 3); assert.equal(g.restockers[0].assignedAisleId, "a1"); assert.equal(g.storeroom.produce, 77);
  assert.ok(g.cash >= 1234); assert.ok(g.xp > 0, "legacy saves get XP from history"); assert.deepEqual(g.staff, []); assert.equal(g.objectiveStep, 0); });
t("new fields survive save → load", () => {
  const g = useGame.getState(); useGame.setState({ cash: 1e6, xp: 3000 }); g.hireStaff("cashier"); g.hireStaff("cleaner"); g.claimObjective(); g.saveGame();
  const saved = JSON.parse(store[SAVE_KEY]); assert.equal(saved.saveVersion, 2); assert.equal(saved.staff.length, 2);
  useGame.setState({ staff: [], xp: 0, achievements: [], objectiveStep: 0, thefts: 0 }); g.loadGame(); const r = useGame.getState();
  assert.equal(r.staff.length, 2); assert.equal(r.xp, saved.xp); assert.equal(r.objectiveStep, saved.objectiveStep); });
t("expansion needs both cash and level", () => { useGame.setState({ cash: 1e9, xp: 0, tier: 0 }); useGame.getState().expandStore(); assert.equal(useGame.getState().tier, 0); useGame.setState({ xp: xpForLevel(4) }); useGame.getState().expandStore(); assert.equal(useGame.getState().tier, 1); });
t("decor styles are placed, saved and reloaded", () => { useGame.getState().resetGame(); useGame.setState({ cash: 1e6 }); useGame.getState().buyItem("decor", undefined, 5, 0, "bench"); useGame.getState().buyItem("decor", undefined, 4, 0, "nonsense");
  assert.equal(useGame.getState().decors[0].style, "bench"); assert.equal(useGame.getState().decors[1].style, "plant"); useGame.getState().saveGame(); useGame.setState({ decors: [] }); useGame.getState().loadGame(); assert.deepEqual(useGame.getState().decors.map((d) => d.style), ["bench", "plant"]); });
t("reset wipes new fields too", () => { useGame.getState().resetGame(); const g = useGame.getState(); assert.equal(g.xp, 0); assert.equal(g.staff.length, 0); assert.equal(g.tier, 0); });
console.log(`\n${n} tests passed`); process.exit(0);

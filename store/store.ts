import { create } from "zustand";
import { GameState, SimData, AisleState, CheckoutState, RestockerState, ItemKind, AisleType } from "@/types/game";
import { MAX_OFFLINE, START_CASH, AISLE_DEFS, AISLE_ORDER, TIERS, DELIVERY_TIME } from "@/lib/constants";
import { calculateOfflineEarnings } from "@/lib/economy";
import { simulate, deriveAisle, deriveCheckout, deriveRestocker, placeCost, orderCost, defaultSupply } from "@/lib/simulation";
import { writeSave, readSave, clearSave, num } from "@/lib/saveGame";

const mkAisle = (id: string, type: AisleType, x: number, y: number, level = 1, stock?: number): AisleState =>
  deriveAisle({ id, type, level, stock: stock ?? AISLE_DEFS[type].stock, maxStock: 0, baseRevenue: 0, demandRate: 0, stockConsumptionRate: 0, upgradeCost: 0, x, y });
const mkCheckout = (id: string, x: number, y: number, level = 1, done = 0): CheckoutState =>
  deriveCheckout({ id, level, processingTime: 0, queueCapacity: 0, currentCustomerProgress: 0, customersProcessed: done, upgradeCost: 0, x, y }, 0);
const mkRestocker = (id: string, x: number, y: number, aisle: string | null, level = 1): RestockerState =>
  deriveRestocker({ id, level, restockAmount: 0, cooldown: 0, currentCooldown: 0, assignedAisleId: aisle, upgradeCost: 0, x, y }, 0);
const freshSim = (): SimData => ({
  cash: START_CASH, tier: 0, lifetimeRevenue: 0, totalCustomersServed: 0, earningsPerSecond: 0, lastSavedTimestamp: Date.now(),
  customers: [], floats: [], spawnAcc: 0, nextId: 1,
  aisles: [mkAisle("a1", "produce", 1, 0)], checkouts: [mkCheckout("c1", 2, 3)], restockers: [mkRestocker("r1", 0, 1, null)], decors: [], ...defaultSupply(),
});
const counts = (s: SimData) => ({ customersInStore: s.customers.length, customersInQueue: s.customers.filter((c) => c.phase === "QUEUING" || c.phase === "CHECKOUT").length });
const seq = (list: { id: string }[], p: string) => p + (Math.max(0, ...list.map((x) => parseInt(x.id.slice(1)) || 0)) + 1);
const KEY = { aisle: "aisles", checkout: "checkouts", restocker: "restockers", decor: "decors" } as const;
const taken = (s: SimData, x: number, y: number) => (x === 0 && y === TIERS[s.tier].rows - 1) || [...s.aisles, ...s.checkouts, ...s.restockers, ...s.decors].some((i) => i.x === x && i.y === y); // bottom-left tile is the entrance
const inGrid = (s: SimData, x: number, y: number) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < TIERS[s.tier].cols && y < TIERS[s.tier].rows;

export const useGame = create<GameState>((set, get) => {
  const buy = (key: "aisles" | "checkouts" | "restockers", id: string, label: (x: any) => string) => {
    const s = get(); const list = s[key] as any[]; const i = list.findIndex((x) => x.id === id);
    if (i < 0 || s.cash < list[i].upgradeCost) return;
    const item = { ...list[i], level: list[i].level + 1 };
    const d = key === "aisles" ? deriveAisle(item) : key === "checkouts" ? deriveCheckout(item, 0) : deriveRestocker(item, 0);
    set({ cash: s.cash - list[i].upgradeCost, [key]: list.map((x, j) => (j === i ? d : x)), lastUpgrade: `LEVEL UP! ${label(d)} → Level ${d.level}` } as any);
    get().saveGame();
  };
  return {
    ...freshSim(), ...counts(freshSim()), isInitialized: false, speed: 1, offline: null, lastUpgrade: null,
    upgradeAisle: (id) => buy("aisles", id, (x: AisleState) => `${AISLE_DEFS[x.type].name} #${x.id.slice(1)}`),
    upgradeCheckout: (id) => buy("checkouts", id, (x: CheckoutState) => `Checkout #${x.id.slice(1)}`),
    upgradeRestocker: (id) => buy("restockers", id, (x: RestockerState) => `Restocker #${x.id.slice(1)}`),
    buyItem: (kind, type, x, y) => {
      const s = get(); if (!inGrid(s, x, y) || taken(s, x, y)) return;
      if (kind === "aisle" && (!type || !AISLE_ORDER.slice(0, TIERS[s.tier].aisles).includes(type))) return;
      const cost = placeCost(s, kind, type); if (s.cash < cost) return;
      if (kind === "aisle") set({ aisles: [...s.aisles, mkAisle(seq(s.aisles, "a"), type!, x, y)] });
      else if (kind === "checkout") set({ checkouts: [...s.checkouts, mkCheckout(seq(s.checkouts, "c"), x, y)] });
      else if (kind === "decor") set({ decors: [...s.decors, { id: seq(s.decors, "d"), x, y }] });
      else { set({ restockers: [...s.restockers, mkRestocker(seq(s.restockers, "r"), x, y, null)] }); }
      set({ cash: s.cash - cost, lastUpgrade: "Built!" }); get().saveGame();
    },
    moveItem: (kind, id, x, y) => {
      const s = get(); if (!inGrid(s, x, y) || taken(s, x, y)) return;
      set({ [KEY[kind]]: (s[KEY[kind]] as any[]).map((i) => (i.id === id ? { ...i, x, y } : i)) } as any); get().saveGame();
    },
    sellItem: (kind, id) => {
      const s = get(); const item: any = (s[KEY[kind]] as any[]).find((i) => i.id === id); if (!item) return;
      if ((kind === "aisle" && s.aisles.length <= 1) || (kind === "checkout" && s.checkouts.length <= 1)) return;
      const refund = Math.floor(0.5 * placeCost(s, kind, item.type, -1));
      const aisles = kind === "aisle" ? s.aisles.filter((a) => a.id !== id) : s.aisles;
      const restockers = (kind === "restocker" ? s.restockers.filter((r) => r.id !== id) : s.restockers).map((r) => (r.assignedAisleId === id ? { ...r, assignedAisleId: null } : r));
      const checkouts = kind === "checkout" ? s.checkouts.filter((c) => c.id !== id) : s.checkouts;
      const customers = kind === "checkout" ? s.customers.map((c) => (c.co === id ? { ...c, co: null, phase: "LEAVING" as const, t: 1, basket: 0, mood: "😡" } : c)) : s.customers;
      set({ aisles, restockers, checkouts, customers, decors: kind === "decor" ? s.decors.filter((d) => d.id !== id) : s.decors, cash: s.cash + refund }); get().saveGame();
    },
    expandStore: () => { const s = get(), n = TIERS[s.tier + 1]; if (!n || s.cash < n.cost) return;
      set({ cash: s.cash - n.cost, tier: s.tier + 1, lastUpgrade: `STORE EXPANDED! ${n.name}` }); get().saveGame(); },
    assignRestocker: (id, aisleId) => { set({ restockers: get().restockers.map((r) => (r.id === id ? { ...r, assignedAisleId: aisleId || null } : r)) }); get().saveGame(); },
    simulateTick: (dt) => { if (!(dt > 0)) return; const n = simulate(get(), Math.min(dt, 1)); set({ ...n, ...counts(n) }); },
    saveGame: () => { const s = get(); if (!s.isInitialized) return; const t = Date.now(); set({ lastSavedTimestamp: t });
      writeSave({ cash: s.cash, tier: s.tier, lifetimeRevenue: s.lifetimeRevenue, totalCustomersServed: s.totalCustomersServed, earningsPerSecond: s.earningsPerSecond, lastSavedTimestamp: t, aisles: s.aisles, checkouts: s.checkouts, restockers: s.restockers, decors: s.decors, storeroom: s.storeroom, orders: s.orders, standing: s.standing }); },
    loadGame: () => {
      const f = freshSim(), o = readSave();
      if (!o) { set({ ...f, isInitialized: true }); get().saveGame(); return; }
      const tier = Math.floor(num(o.tier, 0, 0, TIERS.length - 1)), { cols, rows } = TIERS[tier], used = new Set<string>();
      const lst = (v: unknown): any[] => (Array.isArray(v) ? v : []);
      const take = (m: any, p: string) => { const x = Math.floor(num(m?.x, -1, -1, 1e3)), y = Math.floor(num(m?.y, -1, -1, 1e3)), k = `${x},${y}`;
        if (typeof m?.id !== "string" || !new RegExp(`^${p}\\d+$`).test(m.id) || x < 0 || y < 0 || x >= cols || y >= rows || (x === 0 && y === rows - 1) || used.has(k)) return null; used.add(k); return { x, y }; };
      let aisles = lst(o.aisles).flatMap((m) => { const p = AISLE_ORDER.includes(m?.type) && take(m, "a"); return p ? [mkAisle(m.id, m.type, p.x, p.y, Math.floor(num(m.level, 1, 1, 9999)), num(m.stock, 0, 0, 1e9))] : []; });
      if (!aisles.length) { aisles = f.aisles; used.add("1,0"); }
      let checkouts = lst(o.checkouts).flatMap((m) => { const p = take(m, "c"); return p ? [mkCheckout(m.id, p.x, p.y, Math.floor(num(m.level, 1, 1, 9999)), num(m.customersProcessed, 0))] : []; });
      if (!checkouts.length) { checkouts = f.checkouts; used.add("2,3"); }
      const restockers = lst(o.restockers).flatMap((m) => { const p = take(m, "r"); if (!p) return [];
        return [mkRestocker(m.id, p.x, p.y, aisles.some((a) => a.id === m.assignedAisleId) ? m.assignedAisleId : null, Math.floor(num(m.level, 1, 1, 9999)))]; });
      const decors = lst(o.decors).flatMap((m) => { const p = take(m, "d"); return p ? [{ id: m.id as string, x: p.x, y: p.y }] : []; });
      const eps = num(o.earningsPerSecond, 0, 0, 1e15), seconds = Math.min(MAX_OFFLINE, Math.max(0, (Date.now() - num(o.lastSavedTimestamp, Date.now(), 0, Date.now())) / 1000));
      const earnings = calculateOfflineEarnings(eps, seconds, MAX_OFFLINE);
      const def = defaultSupply(), storeroom = { ...def.storeroom }, standing = { ...def.standing };
      for (const t of AISLE_ORDER) { storeroom[t] = num(o.storeroom?.[t], def.storeroom[t], 0, 1e9); const m = o.standing?.[t]; if (m) standing[t] = { on: !!m.on, below: num(m.below, 0.6, 0, 1), qty: Math.floor(num(m.qty, 100, 1, 5000)) }; }
      let orders = lst(o.orders).flatMap((m) => (AISLE_ORDER.includes(m?.type) ? [{ id: Math.floor(num(m.id, 0)), type: m.type as AisleType, qty: Math.floor(num(m.qty, 0, 0, 1e6)), eta: num(m.eta, 0, 0, 1e4) - seconds, cost: num(m.cost, 0) }] : []));
      orders.filter((x) => x.eta <= 0).forEach((x) => (storeroom[x.type] += x.qty)); orders = orders.filter((x) => x.eta > 0);
      set({ ...f, tier, aisles, checkouts, restockers, decors, storeroom, standing, orders, earningsPerSecond: eps, lifetimeRevenue: num(o.lifetimeRevenue, 0), totalCustomersServed: num(o.totalCustomersServed, 0),
        cash: num(o.cash, START_CASH, 0, 1e15) + earnings, isInitialized: true, offline: earnings > 0 && seconds > 30 ? { seconds, earnings } : null });
      get().saveGame();
    },
    orderStock: (type, qty) => { const s = get(); qty = Math.min(5000, Math.floor(qty));
      if (!(qty > 0) || !s.aisles.some((a) => a.type === type)) return;
      const cost = orderCost(type, qty); if (s.cash < cost) return;
      set({ cash: s.cash - cost, orders: [...s.orders, { id: s.nextId, type, qty, eta: DELIVERY_TIME, cost }], nextId: s.nextId + 1 }); get().saveGame(); },
    setStanding: (type, patch) => { const s = get(); set({ standing: { ...s.standing, [type]: { ...s.standing[type], ...patch } } }); get().saveGame(); },
    collectOffline: () => set({ offline: null }),
    resetGame: () => { clearSave(); set({ ...freshSim(), isInitialized: true, offline: null, lastUpgrade: null }); get().saveGame(); },
    setSpeed: (n) => set({ speed: n }),
    debug: (cmd) => { const s = get();
      if (cmd === "10k") set({ cash: s.cash + 1e4 }); if (cmd === "1m") set({ cash: s.cash + 1e6 });
      if (cmd === "fill") set({ aisles: s.aisles.map((a) => ({ ...a, stock: a.maxStock })) });
      if (cmd === "empty") set({ aisles: s.aisles.map((a) => ({ ...a, stock: 0 })) });
      if (cmd === "spawn") set({ spawnAcc: s.spawnAcc + 1 });
      if (cmd === "offline") { const e = calculateOfflineEarnings(s.earningsPerSecond, 3600, MAX_OFFLINE); set({ cash: s.cash + e, offline: { seconds: 3600, earnings: e } }); } },
  };
});

import { create } from "zustand";
import { GameState, SimData, AisleState, CheckoutState, RestockerState } from "@/types/game";
import { MAX_OFFLINE, START_CASH, AISLE_DEFS } from "@/lib/constants";
import { calculateOfflineEarnings } from "@/lib/economy";
import { simulate, deriveAisle, deriveCheckout, deriveRestocker } from "@/lib/simulation";
import { writeSave, readSave, clearSave, num } from "@/lib/saveGame";

const freshSim = (): SimData => ({
  cash: START_CASH, lifetimeRevenue: 0, totalCustomersServed: 0, earningsPerSecond: 0, lastSavedTimestamp: Date.now(),
  customers: [], floats: [], spawnAcc: 0, nextId: 1,
  aisles: (["produce", "bakery", "electronics"] as const).map((t, i) => deriveAisle({ id: t, type: t, level: i === 0 ? 1 : 0, stock: AISLE_DEFS[t].stock, maxStock: 0, baseRevenue: 0, demandRate: 0, stockConsumptionRate: 0, upgradeCost: 0 })),
  checkouts: [0, 1].map((i) => deriveCheckout({ id: `c${i + 1}`, level: i === 0 ? 1 : 0, processingTime: 0, queueCapacity: 0, currentCustomerProgress: 0, customersProcessed: 0, upgradeCost: 0 }, i)),
  restockers: [0, 1].map((i) => deriveRestocker({ id: `r${i + 1}`, level: i === 0 ? 1 : 0, restockAmount: 0, cooldown: 0, currentCooldown: 0, assignedAisleId: i === 0 ? "produce" : "bakery", upgradeCost: 0 }, i)),
});
const counts = (s: SimData) => ({ customersInStore: s.customers.length, customersInQueue: s.customers.filter((c) => c.phase === "QUEUING" || c.phase === "CHECKOUT").length });

export const useGame = create<GameState>((set, get) => {
  const buy = <T extends { level: number; upgradeCost: number }>(key: "aisles" | "checkouts" | "restockers", id: string, label: (x: any) => string) => {
    const s = get(); const list = s[key] as unknown as (T & { id: string })[]; const i = list.findIndex((x) => x.id === id);
    if (i < 0 || s.cash < list[i].upgradeCost) return;
    const item = { ...list[i], level: list[i].level + 1 } as any;
    const d = key === "aisles" ? deriveAisle(item) : key === "checkouts" ? deriveCheckout(item, i) : deriveRestocker(item, i);
    const next = list.map((x, j) => (j === i ? d : x));
    set({ cash: s.cash - list[i].upgradeCost, [key]: next, lastUpgrade: `LEVEL UP! ${label(d)} → Level ${d.level}` } as any);
    get().saveGame();
  };
  return {
    ...freshSim(), ...counts(freshSim()), isInitialized: false, speed: 1, offline: null, lastUpgrade: null,
    upgradeAisle: (id) => buy("aisles", id, (x: AisleState) => AISLE_DEFS[x.type].name),
    upgradeCheckout: (id) => buy("checkouts", id, (x: CheckoutState) => `Checkout #${x.id.slice(1)}`),
    upgradeRestocker: (id) => buy("restockers", id, (x: RestockerState) => `Restocker #${x.id.slice(1)}`),
    assignRestocker: (id, aisleId) => { set({ restockers: get().restockers.map((r) => (r.id === id ? { ...r, assignedAisleId: aisleId } : r)) }); get().saveGame(); },
    simulateTick: (dt) => {
      if (!(dt > 0)) return;
      const n = simulate(get(), Math.min(dt, 1)); set({ ...n, ...counts(n) });
    },
    saveGame: () => { const s = get(); if (!s.isInitialized) return; const t = Date.now(); set({ lastSavedTimestamp: t });
      writeSave({ cash: s.cash, lifetimeRevenue: s.lifetimeRevenue, totalCustomersServed: s.totalCustomersServed, earningsPerSecond: s.earningsPerSecond, lastSavedTimestamp: t, aisles: s.aisles, checkouts: s.checkouts, restockers: s.restockers }); },
    loadGame: () => {
      const f = freshSim(), o = readSave();
      if (!o) { set({ ...f, isInitialized: true }); get().saveGame(); return; }
      const arr = (v: unknown) => (Array.isArray(v) ? v : []);
      const aisles = f.aisles.map((a) => { const m = arr(o.aisles).find((x: any) => x?.id === a.id); return m ? deriveAisle({ ...a, level: Math.floor(num(m.level, a.level, 0, 9999)), stock: num(m.stock, a.stock, 0, 1e9) }) : a; });
      const checkouts = f.checkouts.map((c, i) => { const m = arr(o.checkouts).find((x: any) => x?.id === c.id); return m ? deriveCheckout({ ...c, level: Math.floor(num(m.level, c.level, 0, 9999)), customersProcessed: num(m.customersProcessed, 0) }, i) : c; });
      const restockers = f.restockers.map((r, i) => { const m = arr(o.restockers).find((x: any) => x?.id === r.id); const ok = m && aisles.some((a) => a.id === m.assignedAisleId);
        return m ? deriveRestocker({ ...r, level: Math.floor(num(m.level, r.level, 0, 9999)), assignedAisleId: ok ? m.assignedAisleId : r.assignedAisleId }, i) : r; });
      const eps = num(o.earningsPerSecond, 0, 0, 1e15), seconds = Math.min(MAX_OFFLINE, Math.max(0, (Date.now() - num(o.lastSavedTimestamp, Date.now(), 0, Date.now())) / 1000));
      const earnings = calculateOfflineEarnings(eps, seconds, MAX_OFFLINE);
      set({ ...f, aisles, checkouts, restockers, earningsPerSecond: eps, lifetimeRevenue: num(o.lifetimeRevenue, 0), totalCustomersServed: num(o.totalCustomersServed, 0),
        cash: num(o.cash, START_CASH, 0, 1e15) + earnings, isInitialized: true, offline: earnings > 0 && seconds > 30 ? { seconds, earnings } : null } as any);
      get().saveGame(); // resets timestamp so a refresh cannot re-award the same time
    },
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

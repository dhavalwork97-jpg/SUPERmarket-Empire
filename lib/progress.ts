import { SimData } from "@/types/game";
import { AISLE_ORDER, TIERS } from "./constants";

/** ---- XP / levels: cumulative XP needed for level L is 60·(L−1)² ---- */
export const xpForLevel = (l: number) => 60 * Math.pow(Math.max(1, l) - 1, 2);
export const levelOf = (xp: number) => Math.floor(Math.sqrt(Math.max(0, xp) / 60)) + 1;
export function levelInfo(xp: number) {
  const level = levelOf(xp), lo = xpForLevel(level), hi = xpForLevel(level + 1);
  return { level, into: xp - lo, need: hi - lo, pct: Math.min(1, (xp - lo) / (hi - lo)) };
}
export const xpForSale = (basket: number) => 1 + Math.round(Math.sqrt(Math.max(0, basket)));

/** ---- Objectives: an ordered tutorial-ish list, then an endless generated ladder so there is always a next goal ---- */
export interface Objective { id: string; title: string; hint: string; target: number; value: (s: SimData) => number; cash: number; xp: number; money?: boolean; tab?: "build" | "staff" | "supply" | "goals" }
const lvl = (s: SimData) => levelOf(s.xp);
const maxItemLevel = (s: SimData) => Math.max(0, ...s.aisles.map((a) => a.level), ...s.checkouts.map((c) => c.level), ...s.restockers.map((r) => r.level));
const cats = (s: SimData) => new Set(s.aisles.filter((a) => a.level > 0).map((a) => a.type)).size;
const hired = (role: string) => (s: SimData) => s.staff.filter((x) => x.role === role).length;
export const OBJECTIVES: Objective[] = [
  { id: "serve10", title: "Serve 10 customers", hint: "Watch shoppers walk in, grab goods and pay at the checkout.", target: 10, value: (s) => s.totalCustomersServed, cash: 60, xp: 25 },
  { id: "earn500", title: "Earn $500 in sales", hint: "Upgrade the Produce shelf or checkout to earn faster.", target: 500, value: (s) => s.lifetimeRevenue, cash: 100, xp: 30, money: true, tab: "build" },
  { id: "bakery", title: "Build your first Bakery aisle", hint: "Tap Bakery in the build bar, then tap an empty tile on the floor.", target: 1, value: (s) => s.aisles.filter((a) => a.type === "bakery" && a.level > 0).length, cash: 150, xp: 40 },
  { id: "cashier", title: "Hire your first cashier", hint: "Open the Staff tab. Cashiers speed up a checkout lane (unlocks at level 2).", target: 1, value: hired("cashier"), cash: 150, xp: 50, tab: "staff" },
  { id: "lvl4", title: "Reach Level 4", hint: "Every sale earns XP. Level 4 unlocks the Growing Store expansion.", target: 4, value: lvl, cash: 300, xp: 0 },
  { id: "item5", title: "Upgrade anything to Level 5", hint: "Upgrades raise revenue, capacity or speed.", target: 5, value: maxItemLevel, cash: 300, xp: 60, tab: "build" },
  { id: "checkout2", title: "Build a second checkout", hint: "Long queues make shoppers leave angry. Tap Checkout in the build bar.", target: 2, value: (s) => s.checkouts.filter((c) => c.level > 0).length, cash: 300, xp: 60 },
  { id: "serve100", title: "Serve 100 customers", hint: "Keep shelves stocked and queues short.", target: 100, value: (s) => s.totalCustomersServed, cash: 500, xp: 80 },
  { id: "cleaner", title: "Hire a cleaner", hint: "A dirty store lowers demand and happiness (unlocks at level 3).", target: 1, value: hired("cleaner"), cash: 400, xp: 80, tab: "staff" },
  { id: "earn10k", title: "Earn $10,000 in sales", hint: "Add aisles for categories shoppers want.", target: 10000, value: (s) => s.lifetimeRevenue, cash: 1000, xp: 120, money: true },
  { id: "security", title: "Hire security", hint: "Shoplifters steal baskets. A guard stops them (unlocks at level 4).", target: 1, value: hired("security"), cash: 800, xp: 120, tab: "staff" },
  { id: "tier1", title: "Expand to a Growing Store", hint: "Open the Upgrades tab: bigger floor, more aisle types, more customers.", target: 1, value: (s) => s.tier, cash: 3000, xp: 250, tab: "build" },
  { id: "manager", title: "Hire a manager", hint: "A manager boosts every other employee (unlocks at level 5).", target: 1, value: hired("manager"), cash: 2000, xp: 200, tab: "staff" },
  { id: "cats4", title: "Stock 4 different categories", hint: "Each category sells differently. Mix cheap volume with premium goods.", target: 4, value: cats, cash: 5000, xp: 250 },
  { id: "serve500", title: "Serve 500 customers", hint: "Add checkouts and cashiers to keep up with demand.", target: 500, value: (s) => s.totalCustomersServed, cash: 5000, xp: 300 },
  { id: "lvl10", title: "Reach Level 10", hint: "Level 10 unlocks the Large Supermarket.", target: 10, value: lvl, cash: 10000, xp: 0 },
  { id: "earn250k", title: "Earn $250,000 in sales", hint: "Upgrade your best-selling aisles.", target: 250000, value: (s) => s.lifetimeRevenue, cash: 25000, xp: 500, money: true },
  { id: "tier2", title: "Expand to a Large Supermarket", hint: "The biggest floor, all six categories and the most staff.", target: 2, value: (s) => s.tier, cash: 100000, xp: 800, tab: "build" },
  { id: "cats6", title: "Stock all 6 categories", hint: "Freezer and Deli are your highest-margin goods.", target: 6, value: cats, cash: 100000, xp: 800 },
  { id: "serve5k", title: "Serve 5,000 customers", hint: "A well-run supermarket never sleeps.", target: 5000, value: (s) => s.totalCustomersServed, cash: 250000, xp: 1200 },
];
/** Past the list, goals repeat in a rising loop so a long-running save always has something to chase. */
export function objectiveAt(step: number): Objective {
  if (step < OBJECTIVES.length) return OBJECTIVES[step];
  const k = step - OBJECTIVES.length, r = Math.floor(k / 3) + 1, kind = k % 3;
  if (kind === 0) { const t = 5000 * Math.pow(2, r); return { id: `serve-${t}`, title: `Serve ${t.toLocaleString()} customers`, hint: "Keep growing.", target: t, value: (s) => s.totalCustomersServed, cash: t * 60, xp: 1500 * r }; }
  if (kind === 1) { const t = 250000 * Math.pow(4, r); return { id: `earn-${t}`, title: `Earn $${t.toLocaleString()} in sales`, hint: "Upgrade everything.", target: t, value: (s) => s.lifetimeRevenue, cash: t * 0.1, xp: 1500 * r, money: true }; }
  const t = 10 + 3 * r; return { id: `lvl-${t}`, title: `Reach Level ${t}`, hint: "Sell, sell, sell.", target: t, value: lvl, cash: 50000 * r * r, xp: 0 };
}

/** ---- Achievements: one-time unlocks checked a few times a second ---- */
export interface Achievement { id: string; name: string; desc: string; test: (s: SimData) => boolean; xp: number }
export const ACHIEVEMENTS: Achievement[] = [
  { id: "first", name: "Open for Business", desc: "Serve your first customer", test: (s) => s.totalCustomersServed >= 1, xp: 10 },
  { id: "c100", name: "Regulars", desc: "Serve 100 customers", test: (s) => s.totalCustomersServed >= 100, xp: 40 },
  { id: "c1k", name: "Neighbourhood Favourite", desc: "Serve 1,000 customers", test: (s) => s.totalCustomersServed >= 1000, xp: 120 },
  { id: "c10k", name: "Local Legend", desc: "Serve 10,000 customers", test: (s) => s.totalCustomersServed >= 10000, xp: 400 },
  { id: "r10k", name: "Five Figures", desc: "Earn $10,000 in sales", test: (s) => s.lifetimeRevenue >= 1e4, xp: 60 },
  { id: "r1m", name: "Millionaire", desc: "Earn $1,000,000 in sales", test: (s) => s.lifetimeRevenue >= 1e6, xp: 300 },
  { id: "cats", name: "One of Everything", desc: "Stock all 6 categories", test: (s) => cats(s) >= 6, xp: 200 },
  { id: "team", name: "Dream Team", desc: "Hire a cashier, cleaner, guard and manager", test: (s) => ["cashier", "cleaner", "security", "manager"].every((r) => s.staff.some((x) => x.role === r)), xp: 200 },
  { id: "tier2", name: "Big League", desc: "Reach the Large Supermarket", test: (s) => s.tier >= TIERS.length - 1, xp: 300 },
  { id: "lvl10", name: "Seasoned Owner", desc: "Reach level 10", test: (s) => lvl(s) >= 10, xp: 100 },
  { id: "guard", name: "Eagle Eye", desc: "Stop 10 shoplifters", test: (s) => s.theftsPrevented >= 10, xp: 100 },
  { id: "happy", name: "Five Stars", desc: "Reach 90% customer satisfaction", test: (s) => s.satisfaction >= 0.9 && s.totalCustomersServed > 30, xp: 150 },
];
export { AISLE_ORDER };

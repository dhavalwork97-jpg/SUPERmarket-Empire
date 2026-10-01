import { AisleType } from "@/types/game";
export const TICK = 0.1, MAX_OFFLINE = 4 * 3600, SAVE_VERSION = 1, SAVE_KEY = "supermarket-tycoon-save", START_CASH = 500, MAX_CUSTOMERS = 300, DELIVERY_TIME = 45;
export const AISLE_ORDER: AisleType[] = ["produce", "bakery", "electronics", "refrigerated", "freezer", "deli"];
export const AISLE_DEFS: Record<AisleType, { name: string; emoji: string; rev: number; stock: number; demand: number; use: number; cost: number }> = {
  produce: { name: "Produce", emoji: "🥬", rev: 10, stock: 100, demand: 0.9, use: 4, cost: 35 },
  bakery: { name: "Bakery", emoji: "🍞", rev: 14, stock: 80, demand: 0.6, use: 6, cost: 250 },
  electronics: { name: "Electronics", emoji: "📺", rev: 35, stock: 40, demand: 0.3, use: 3, cost: 900 },
  refrigerated: { name: "Refrigerated", emoji: "🥛", rev: 22, stock: 60, demand: 0.5, use: 4, cost: 1500 },
  freezer: { name: "Freezer", emoji: "🧊", rev: 30, stock: 50, demand: 0.4, use: 4, cost: 6000 },
  deli: { name: "Deli", emoji: "🥩", rev: 55, stock: 40, demand: 0.3, use: 4, cost: 12000 },
};
// Each tier: grid size, shelf types unlocked (first N of AISLE_ORDER), demand multiplier, one-time cost.
export const TIERS = [
  { name: "Small Shop", emoji: "🏪", img: "/assets/environment/storefront-small.png", cols: 6, rows: 4, aisles: 2, demand: 1, cost: 0 },
  { name: "Mid Store", emoji: "🏬", img: "/assets/environment/storefront-medium.png", cols: 8, rows: 6, aisles: 4, demand: 1.5, cost: 25000 },
  { name: "Large Supermarket", emoji: "🏢", img: "/assets/environment/storefront-large.png", cols: 11, rows: 7, aisles: 6, demand: 2.2, cost: 1500000 },
];
export const CHECKOUT = { time: 4, cap: 5, capInc: 1, cost: 45, mult: 1.18, place: 100 };
export const RESTOCK = { amount: 20, cooldown: 8, cost: 40, mult: 1.2, place: 80 };
export const AISLE_MULT = 1.15, BASE_DEMAND = 0.12;

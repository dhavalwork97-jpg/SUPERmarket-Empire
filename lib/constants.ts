import { AisleType } from "@/types/game";
export const TICK = 0.1, MAX_OFFLINE = 4 * 3600, SAVE_VERSION = 1, SAVE_KEY = "supermarket-tycoon-save", START_CASH = 500, MAX_CUSTOMERS = 150;
export const AISLE_DEFS: Record<AisleType, { name: string; emoji: string; rev: number; stock: number; demand: number; use: number; cost: number }> = {
  produce: { name: "Produce", emoji: "🥬", rev: 8, stock: 100, demand: 0.9, use: 4, cost: 60 },
  bakery: { name: "Bakery", emoji: "🍞", rev: 14, stock: 80, demand: 0.6, use: 6, cost: 250 },
  electronics: { name: "Electronics", emoji: "🧊", rev: 35, stock: 40, demand: 0.3, use: 3, cost: 900 },
};
export const CHECKOUT = { time: 5, cap: 5, capInc: 1, cost: 80, mult: 1.18 };
export const RESTOCK = { amount: 20, cooldown: 8, cost: 70, mult: 1.2 };
export const AISLE_MULT = 1.15, BASE_DEMAND = 0.12;

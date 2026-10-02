import { AisleType } from "@/types/game";
export const TICK = 0.1, MAX_OFFLINE = 4 * 3600, SAVE_VERSION = 2, SAVE_KEY = "supermarket-tycoon-save", START_CASH = 500, MAX_CUSTOMERS = 300, DELIVERY_TIME = 45;
export const AISLE_ORDER: AisleType[] = ["produce", "bakery", "electronics", "refrigerated", "freezer", "deli"];
/** rev = $ per customer purchase, stock = base shelf capacity, demand = chance a shopper wants this category, use = units sold per purchase,
 *  cost = build price, restock = how fast restockers can refill it (bulky goods are slower), blurb = one-line identity for the UI. */
export const AISLE_DEFS: Record<AisleType, { name: string; emoji: string; rev: number; stock: number; demand: number; use: number; cost: number; restock: number; blurb: string }> = {
  produce: { name: "Produce", emoji: "🥬", rev: 10, stock: 100, demand: 0.9, use: 4, cost: 35, restock: 1.5, blurb: "Everyone buys it. Cheap, high volume, light crates." },
  bakery: { name: "Bakery", emoji: "🍞", rev: 14, stock: 80, demand: 0.6, use: 6, cost: 250, restock: 1.2, blurb: "Steady demand, sells fast." },
  electronics: { name: "Electronics", emoji: "📺", rev: 35, stock: 40, demand: 0.3, use: 3, cost: 900, restock: 0.6, blurb: "Rare but pricey. Small stock, slow to refill." },
  refrigerated: { name: "Refrigerated", emoji: "🥛", rev: 22, stock: 60, demand: 0.5, use: 4, cost: 1500, restock: 1, blurb: "Reliable mid-price staples." },
  freezer: { name: "Freezer", emoji: "🧊", rev: 30, stock: 50, demand: 0.4, use: 4, cost: 6000, restock: 0.8, blurb: "Big baskets, bulky to restock." },
  deli: { name: "Deli", emoji: "🥩", rev: 55, stock: 40, demand: 0.3, use: 4, cost: 12000, restock: 0.7, blurb: "Your highest margin. Low volume." },
};
// Each tier: grid size, shelf types unlocked (first N of AISLE_ORDER), demand multiplier, one-time cost, player level needed, running cost ($/s), staff slots.
export const TIERS = [
  { name: "Small Shop", emoji: "🏪", img: "/assets/web/environment/storefront-small.webp", cols: 6, rows: 4, aisles: 2, demand: 1, cost: 0, level: 1, upkeep: 0.05, staff: 2 },
  { name: "Growing Store", emoji: "🏬", img: "/assets/web/environment/storefront-medium.webp", cols: 8, rows: 6, aisles: 4, demand: 1.5, cost: 25000, level: 4, upkeep: 1.2, staff: 4 },
  { name: "Large Supermarket", emoji: "🏢", img: "/assets/web/environment/storefront-large.webp", cols: 11, rows: 7, aisles: 6, demand: 2.2, cost: 1500000, level: 10, upkeep: 12, staff: 8 },
];
export const CHECKOUT = { time: 4, cap: 5, capInc: 1, cost: 45, mult: 1.18, place: 100 };
export const RESTOCK = { amount: 20, cooldown: 8, cost: 40, mult: 1.2, place: 80 };
export const AISLE_MULT = 1.15, BASE_DEMAND = 0.12;

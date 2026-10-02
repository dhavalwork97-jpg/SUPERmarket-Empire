import { AisleType } from "@/types/game";
/** Every sprite the game draws. These point at the optimized WebP copies in public/assets/web/ (generated from the original PNGs by scripts/optimize-assets.py). */
export const asset = (folder: string, name: string) => `/assets/web/${folder}/${name}.webp`;
export type IconName = "alert" | "angry" | "capacity" | "check" | "coin" | "dollar" | "gem" | "happy" | "restock" | "speed" | "upgrade" | "wait";
export const icon = (n: IconName) => asset("icons", `icon-${n}`);
export const logo = asset("branding", "logo"), logoText = asset("branding", "logo-text");
export const fxImg = (n: "coin-burst" | "confetti" | "levelup-sparkle") => asset("effects", `fx-${n}`);
export const floorTile = asset("environment", "floor-tile"), floorDirty = asset("environment", "floor-tile-dirty"), entranceDoors = asset("environment", "entrance-doors");
const OOS: Partial<Record<AisleType, string>> = { produce: "aisle-produce-oos", bakery: "aisle-bakery-oos", electronics: "aisle-electronics-oos" };
/** Stocked → type sprite; empty → the type's OOS sprite (or the generic empty shelf where no OOS art exists). Produce gets its bigger stall from level 4. */
export function aisleSprite(type: AisleType, level: number, stockPct: number) {
  if (stockPct <= 0) return asset("aisles", OOS[type] ?? "aisle-empty");
  return asset("aisles", type === "produce" && level >= 4 ? "aisle-produce2" : `aisle-${type}`);
}
export const checkoutSprite = (level: number) => asset("checkouts", level >= 10 ? "checkout-premium" : level >= 5 ? "checkout-express" : "checkout-basic");
export const char = (n: "shopper" | "shopper-3" | "shopper-angry" | "cashier" | "restocker" | "cleaner" | "guard" | "manager") => asset("characters", `char-${n}`);

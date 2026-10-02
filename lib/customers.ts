import { AisleState, CustomerKind } from "@/types/game";
import { AISLE_DEFS } from "./constants";

/** Customer types. Add one entry here to add a new behaviour; simulate() reads only this table. */
export interface CustomerDef {
  name: string; blurb: string;
  weight: (tier: number) => number;      // relative spawn chance
  basket: number;                        // multiplies what they spend
  want: (a: AisleState) => number;       // multiplies the chance they want a category
  patience: number;                      // seconds in a queue before they storm off (Infinity = never)
  maxQueue: number;                      // won't join a lane that already has this many people
  impulse: number;                       // chance of one extra unplanned purchase
  filter: string; scale: number;         // sprite look
}
export const CUSTOMER_KINDS: CustomerKind[] = ["normal", "budget", "impulse", "vip", "impatient"];
export const CUSTOMERS: Record<CustomerKind, CustomerDef> = {
  normal: { name: "Shopper", blurb: "Average in every way.", weight: () => 52, basket: 1, want: () => 1, patience: Infinity, maxQueue: 99, impulse: 0, filter: "none", scale: 1 },
  budget: { name: "Budget shopper", blurb: "Hunts cheap categories, spends less.", weight: () => 18, basket: 0.85, want: (a) => (AISLE_DEFS[a.type].rev <= 14 ? 1.4 : 0.55), patience: Infinity, maxQueue: 99, impulse: 0, filter: "saturate(.65)", scale: 0.95 },
  impulse: { name: "Impulse shopper", blurb: "Often grabs one extra item.", weight: () => 14, basket: 1, want: () => 1, patience: Infinity, maxQueue: 99, impulse: 0.45, filter: "drop-shadow(0 0 3px #f472b6)", scale: 1 },
  vip: { name: "High-value shopper", blurb: "Rare. Loves premium goods and spends big.", weight: (t) => 3 + 2 * t, basket: 1.6, want: (a) => (AISLE_DEFS[a.type].rev >= 30 ? 1.6 : 0.7), patience: Infinity, maxQueue: 99, impulse: 0.1, filter: "drop-shadow(0 0 4px #fbbf24)", scale: 1.12 },
  impatient: { name: "Impatient shopper", blurb: "Leaves angry if the queue is long.", weight: () => 13, basket: 1, want: () => 1, patience: 6, maxQueue: 3, impulse: 0, filter: "drop-shadow(0 0 3px #f87171)", scale: 1 },
};
export function rollKind(tier: number, boost: Partial<Record<CustomerKind, number>> = {}): CustomerKind {
  const w = CUSTOMER_KINDS.map((k) => CUSTOMERS[k].weight(tier) * (boost[k] ?? 1)); let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return CUSTOMER_KINDS[i]; }
  return "normal";
}

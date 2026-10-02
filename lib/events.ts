import { AisleType, CustomerKind } from "@/types/game";
export const DAY_SECONDS = 90;
/** Daily events: each lasts one game day. Add an entry to add an event; simulate() reads only these modifiers. */
export interface EventDef { name: string; blurb: string; demand?: number; revenue?: Partial<Record<AisleType, number>>; kinds?: Partial<Record<CustomerKind, number>>; }
export const EVENTS: Record<string, EventDef> = {
  rush: { name: "Weekend Rush", blurb: "Customer demand +50%", demand: 1.5 },
  slow: { name: "Quiet Day", blurb: "Customer demand −30%", demand: 0.7 },
  fresh: { name: "Farm Fresh Day", blurb: "Produce & Bakery pay +30%", revenue: { produce: 1.3, bakery: 1.3 } },
  heat: { name: "Heatwave", blurb: "Fridge & Freezer pay +40%", revenue: { refrigerated: 1.4, freezer: 1.4 } },
  coupon: { name: "Coupon Day", blurb: "Budget shoppers ×3, demand +20%", demand: 1.2, kinds: { budget: 3 } },
  expo: { name: "Tech Expo", blurb: "Electronics +50%, more big spenders", revenue: { electronics: 1.5 }, kinds: { vip: 3 } },
};
const IDS = Object.keys(EVENTS);
export const rollEvent = () => (Math.random() < 0.4 ? { id: IDS[Math.floor(Math.random() * IDS.length)], left: DAY_SECONDS } : null);
export const dayOf = (clock: number) => Math.floor(clock / DAY_SECONDS) + 1;

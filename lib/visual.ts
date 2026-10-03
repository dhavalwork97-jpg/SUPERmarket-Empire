/**
 * Visual rules for the 3D store. Pure functions only (no three.js), so they can be unit-tested and so Store3DScene stays a drawing layer:
 * it asks "what should this aisle look like?" and draws the answer. Nothing in here touches the simulation, the economy or the navigation grid.
 *
 * Every piece named below is built from meshes that are in the supplied ZIP (see scripts/build-store-assets.py and docs/3d-visual-upgrade.md).
 */
import type { AisleType } from "@/types/game";

export type Quality = "low" | "high";
export const QUALITY_KEY = "supermarket-3d-quality";

/** low = phones with little memory (lite textures, no normal maps, simpler fixtures, cheaper carts, no ceiling); high = everything. `override` (?q=low|high) and `saved` win over detection. */
export function pickQuality(i: { override?: string | null; saved?: string | null; deviceMemory?: number; cores?: number; coarse?: boolean }): Quality {
  for (const v of [i.override, i.saved]) if (v === "low" || v === "high") return v;
  if (typeof i.deviceMemory === "number") return i.deviceMemory <= 4 ? "low" : "high";
  if (i.coarse && (i.cores ?? 4) <= 6) return "low";   // iOS / unknown Android: no deviceMemory, but touch + <=6 cores is the budget phone profile
  return "high";
}

/** Fixture node names inside fixtures.glb. */
export type FixtureNode = "shelf_bay" | "shelf_low" | "display_wall" | "fridge_bay" | "fridge_cabinet" | "freezer_chest" | "freezer_lite";
export type PlanKey = "shelf_bay" | "shelf_low" | "display_wall" | "fridge_bay" | "freezer_chest" | "deli_top";

export interface AisleLook {
  fixture: FixtureNode;
  /** 2 = shoppers reach both faces (gondola), 1 = one face against the back of the tile */
  sides: 1 | 2;
  /** products sit on boards chosen by this plan (see PLAN in the scene) */
  plan: PlanKey;
  /** animated fridge doors (door_0/1/2) instead of the baked-in ones */
  doors: boolean;
  /** end-cap pieces may be added on free ends */
  endcaps: boolean;
  /** glass sneeze guard above the lid */
  guard: boolean;
  accentStrip: boolean;
  header: boolean;
  goldPosts: boolean;
}

/**
 * One fixture family per department so a glance tells you where you are:
 * produce = shallow louvred wall rack, bakery = LOW bread table (gondola cut at 1.1 m), electronics = tall gondola (+end caps), refrigerated = glass-door cabinet,
 * freezer = chest with baskets, deli = chest body with the products on the lid under a glass guard.
 */
export function aisleLook(type: AisleType, level: number, q: Quality): AisleLook {
  const hi = q === "high";
  const base = { accentStrip: level >= 3, header: level >= 6, goldPosts: level >= 10, endcaps: false, guard: false, doors: false };
  switch (type) {
    case "produce": return { ...base, fixture: "display_wall", sides: 1, plan: "display_wall" };
    case "bakery": return { ...base, fixture: "shelf_low", sides: 2, plan: "shelf_low" };
    case "electronics": return { ...base, fixture: "shelf_bay", sides: 2, plan: "shelf_bay", endcaps: hi && level >= 3 };
    case "refrigerated": return { ...base, fixture: hi ? "fridge_cabinet" : "fridge_bay", sides: 1, plan: "fridge_bay", doors: hi };
    case "freezer": return { ...base, fixture: "freezer_chest", sides: 1, plan: "freezer_chest" };
    case "deli": return { ...base, fixture: hi ? "freezer_lite" : "freezer_chest", sides: 1, plan: hi ? "deli_top" : "freezer_chest", guard: hi };
  }
}

/** Which ends of a 2-sided bay get an end cap: only ends that face an empty, in-bounds tile (a cap sticks ~0.6 m out of the 3.25 m bay, so never next to another fixture). */
export function endCapSides(x: number, y: number, occupied: ReadonlySet<string>, cols: number, rows: number, hasEndcap: boolean): ("L" | "R")[] {
  if (!hasEndcap) return [];
  const out: ("L" | "R")[] = [], free = (tx: number) => tx >= 0 && tx < cols && !occupied.has(`${tx},${y}`) && y < rows - 1;
  if (free(x - 1)) out.push("L");
  if (free(x + 1)) out.push("R");
  return out;
}

/** Fridge door pose (0 closed, 1 ajar ~31 deg, 2 open ~50 deg) for a door, given the shoppers standing at the cabinet. `reach` = offsets of shoppers in door widths (-1..1 from the cabinet centre). */
export function doorPose(door: 0 | 1 | 2, shoppers: { off: number; seed: number }[]): 0 | 1 | 2 {
  let best: 0 | 1 | 2 = 0;
  for (const s of shoppers) {
    const target = Math.max(0, Math.min(2, Math.round(s.off + 1)));      // door in front of the shopper
    if (target !== door) continue;
    const p: 1 | 2 = (Math.imul(s.seed | 0, 2654435761) >>> 0) % 3 === 0 ? 1 : 2;
    if (p > best) best = p;
  }
  return best;
}

export interface StoreLook {
  /** ceiling light bars: plain white boxes, or the ZIP's light housing + diffuser meshes */
  ceiling: "none" | "bars" | "housings";
  pillars: boolean;
  windowFrames: boolean;
  /** coloured skirting trim along the walls */
  trim: boolean;
}

/** Store tier (0 Small Shop, 1 Growing Store, 2 Large Supermarket) -> architecture. Tier 0 keeps the original plain look so early game is unchanged. */
export function storeLook(tier: number, q: Quality): StoreLook {
  const t = Math.max(0, Math.min(2, Math.floor(tier)));
  return { ceiling: q === "low" ? "none" : t >= 1 ? "housings" : "bars", pillars: q === "high" && t >= 2, windowFrames: t >= 2 && q === "high", trim: true };
}

/** Cart budget: the wire cart is ~3,100 tris, so low-quality devices get the clustered 2,150-tri one and a smaller cap. */
export const cartPlan = (q: Quality) => ({ node: q === "low" ? "cart_lite" : "cart_a", cap: q === "low" ? 24 : 64 });

/** Texture folder: low devices load the 512/256 px set (~11 MB decoded instead of ~47 MB). */
export const texDir = (q: Quality) => (q === "low" ? "/assets/3d/tex/lite/" : "/assets/3d/tex/");

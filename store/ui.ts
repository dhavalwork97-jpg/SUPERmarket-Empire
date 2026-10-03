import { create } from "zustand";
import { AisleType, ItemKind } from "@/types/game";
export type Sheet = "build" | "staff" | "supply" | "goals";
/** What the player is doing with the world: placing something new, or has tapped (and maybe is moving) an existing thing. */
export type Sel = { mode: "new"; kind: ItemKind; type?: AisleType } | { mode: "move" | "item"; kind: ItemKind; id: string } | null;
/** Pure view state (which sheet is open, what is selected). Gameplay state stays in useGame. */
export const useUI = create<{ sheet: Sheet | null; sel: Sel; decorStyle: string; open: (s: Sheet | null) => void; select: (s: Sel) => void; setDecor: (d: string) => void }>((set) => ({
  sheet: null, sel: null, decorStyle: "plant",
  open: (sheet) => set(sheet ? { sheet, sel: null } : { sheet: null }),
  select: (sel) => set(sel ? { sel, sheet: null } : { sel: null }),
  setDecor: (decorStyle) => set({ decorStyle }),
}));

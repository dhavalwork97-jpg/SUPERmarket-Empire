import { SAVE_KEY, SAVE_VERSION } from "./constants";
import { CoreData } from "@/types/game";
export const num = (v: unknown, d: number, min = 0, max = 1e300) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
export function writeSave(d: CoreData) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ saveVersion: SAVE_VERSION, ...d })); } catch {}
}
export function readSave(): Record<string, any> | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY); if (!raw) return null;
    const o = JSON.parse(raw); return o && typeof o === "object" && typeof o.saveVersion === "number" ? o : null;
  } catch { return null; }
}
export const clearSave = () => { try { localStorage.removeItem(SAVE_KEY); } catch {} };

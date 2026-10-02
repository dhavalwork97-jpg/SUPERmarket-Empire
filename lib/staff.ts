import { CheckoutState, StaffRole, StaffState, RestockerState } from "@/types/game";
import { TIERS } from "./constants";
import { getPlaceCost, getUpgradeCost } from "./economy";

/** Every role: what it does, what it costs, and how it scales. Add a role here (+ a branch in simulate) to extend. */
export const STAFF_DEFS: Record<StaffRole, { name: string; img: string; unlockLevel: number; hire: number; up: number; wage: number; perLevel: number; job: string; effect: (eff: number) => string; max: (tier: number, checkouts: number) => number }> = {
  cashier: { name: "Cashier", img: "char-cashier", unlockLevel: 2, hire: 120, up: 90, wage: 0.08, perLevel: 0.15, job: "Staffs a checkout lane (best cashier takes lane 1)", effect: (e) => `Lane scans ${Math.round((e - 1) * 100)}% faster`, max: (_t, c) => c },
  cleaner: { name: "Cleaner", img: "char-cleaner", unlockLevel: 3, hire: 300, up: 200, wage: 0.05, perLevel: 0.3, job: "Mops floors so the store stays clean", effect: (e) => `Cleans ${e.toFixed(1)} pts/s`, max: (t) => (t >= 1 ? 2 : 1) },
  security: { name: "Security", img: "char-guard", unlockLevel: 4, hire: 700, up: 450, wage: 0.06, perLevel: 0.12, job: "Patrols the entrance and stops shoplifters", effect: (e) => `Stops ${Math.round(Math.min(0.85, e) * 100)}% of thefts`, max: (t) => (t >= 1 ? 2 : 1) },
  manager: { name: "Manager", img: "char-manager", unlockLevel: 5, hire: 2500, up: 1500, wage: 0.2, perLevel: 0.05, job: "Boosts every employee's efficiency", effect: (e) => `All staff +${Math.round((e - 1) * 100)}% efficient`, max: () => 1 },
};
export const STAFF_ROLES = Object.keys(STAFF_DEFS) as StaffRole[];
export const RESTOCKER_WAGE = 0.04;

/** Role efficiency at a level (before the manager bonus). Cashier/manager are multipliers (1 = none); cleaner = clean pts/s; security = theft stop chance. */
export function baseEfficiency(role: StaffRole, level: number): number {
  const d = STAFF_DEFS[role], l = Math.max(0, level);
  if (role === "cashier" || role === "manager") return 1 + d.perLevel * l;
  if (role === "security") return d.perLevel * l * 3;
  return d.perLevel * l;
}
export const tierUpkeep = (tier: number) => TIERS[Math.min(tier, TIERS.length - 1)].upkeep;
export const staffWage = (role: StaffRole, level: number, tier: number) => STAFF_DEFS[role].wage * Math.max(1, level) * (1 + 0.5 * tier);
export const restockerWage = (level: number, tier: number) => RESTOCKER_WAGE * Math.max(1, level) * (1 + 0.5 * tier);
export const managerBonus = (staff: StaffState[]) => { const m = staff.find((x) => x.role === "manager"); return m ? baseEfficiency("manager", m.level) : 1; };
export function deriveStaff(s: StaffState, tier: number, staff: StaffState[] = []): StaffState {
  const mb = s.role === "manager" ? 1 : managerBonus(staff), base = baseEfficiency(s.role, s.level);
  // The manager's bonus multiplies the *gain* over baseline for multiplier roles, and the whole value for pts/s roles.
  const efficiency = s.role === "cashier" ? 1 + (base - 1) * mb : s.role === "manager" ? base : base * mb;
  return { ...s, efficiency, salary: staffWage(s.role, s.level, tier), upgradeCost: getUpgradeCost(STAFF_DEFS[s.role].up, 1.3, s.level) };
}
export const rederiveAll = (staff: StaffState[], tier: number) => staff.map((x) => deriveStaff(x, tier, staff));
export const hireCost = (role: StaffRole, owned: number) => getPlaceCost(STAFF_DEFS[role].hire, owned, 2);
export function canHire(role: StaffRole, staff: StaffState[], tier: number, checkouts: number, level: number): { ok: boolean; why: string } {
  const d = STAFF_DEFS[role], t = Math.min(tier, TIERS.length - 1);
  if (level < d.unlockLevel) return { ok: false, why: `Unlocks at level ${d.unlockLevel}` };
  if (staff.length >= TIERS[t].staff) return { ok: false, why: `Staff full (${TIERS[t].staff}). Expand the store for more` };
  if (staff.filter((x) => x.role === role).length >= d.max(tier, checkouts)) return { ok: false, why: role === "cashier" ? "One cashier per checkout lane" : "Maximum hired" };
  return { ok: true, why: "" };
}
/** Strongest cashier works the first lane, and so on. Shared by the simulation and the store view so they always agree. */
export function cashierByLane(staff: StaffState[], checkouts: CheckoutState[]): Record<string, StaffState> {
  const cs = staff.filter((x) => x.role === "cashier").sort((a, b) => b.level - a.level || a.id.localeCompare(b.id));
  const lanes = [...checkouts].filter((c) => c.level > 0).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  const out: Record<string, StaffState> = {}; lanes.forEach((l, i) => { if (cs[i]) out[l.id] = cs[i]; }); return out;
}
export const wagePerSecond = (staff: StaffState[], restockers: RestockerState[], tier: number) =>
  staff.reduce((n, x) => n + x.salary, 0) + restockers.filter((r) => r.level > 0).reduce((n, r) => n + restockerWage(r.level, tier), 0) + tierUpkeep(tier);

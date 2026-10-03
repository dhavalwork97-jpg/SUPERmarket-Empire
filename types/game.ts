export type AisleType = "produce" | "bakery" | "electronics" | "refrigerated" | "freezer" | "deli";
export interface AisleState { id: string; type: AisleType; level: number; stock: number; maxStock: number; baseRevenue: number; demandRate: number; stockConsumptionRate: number; upgradeCost: number; x: number; y: number; }
export interface CheckoutState { id: string; level: number; processingTime: number; queueCapacity: number; currentCustomerProgress: number; customersProcessed: number; upgradeCost: number; x: number; y: number; }
export interface RestockerState { id: string; level: number; restockAmount: number; cooldown: number; currentCooldown: number; assignedAisleId: string | null; upgradeCost: number; x: number; y: number; salary?: number; workload?: number; busy?: number; target?: string; }
export type ItemKind = "aisle" | "checkout" | "restocker" | "decor";
export interface Order { id: number; type: AisleType; qty: number; eta: number; cost: number; }
export interface Standing { on: boolean; below: number; qty: number; }
export interface DecorState { id: string; x: number; y: number; style?: string; }
export type CustomerPhase = "ENTERING" | "SHOPPING" | "QUEUING" | "CHECKOUT" | "LEAVING";
export type CustomerKind = "normal" | "budget" | "impulse" | "vip" | "impatient";
export interface Pt { x: number; y: number }
/**
 * A shopper is a real walker: x/y are tile-centre coordinates (the same space as shelves and checkouts) and every move follows `path`, a route
 * searched from where they stand on the current store layout. `goal` names what that route was planned for and `nav` is the layout version it was
 * planned against, so a changed layout or destination triggers a fresh search.
 */
export interface Customer { id: number; phase: CustomerPhase; kind: CustomerKind; mood: string; basket: number; wait: number; co: string | null;
  plan: string[]; stop: number; dwell: number; x: number; y: number; path: Pt[]; pi: number; goal: string; nav: number; lost: boolean; stuck: number; qn: number; oos?: boolean; gone?: boolean; say?: string; sayT?: number; face?: Pt; }
export type CrewRole = "restocker" | "cleaner" | "guard" | "manager";
/** Staff who roam the floor. Cosmetic: they follow the same navigation as shoppers but never change the economy. */
export interface Walker { id: string; role: CrewRole; x: number; y: number; path: Pt[]; pi: number; goal: string; nav: number; wait: number; turn: number; face?: Pt; task?: string; }
export type StaffRole = "cashier" | "cleaner" | "security" | "manager";
/** efficiency / salary / upgradeCost are derived from role + level (see lib/staff.ts); workload (0..1) is a smoothed live measure. */
export interface StaffState { id: string; role: StaffRole; level: number; efficiency: number; workload: number; salary: number; upgradeCost: number; }
export type FxKind = "toast" | "level" | "xp" | "low" | "oos" | "theft" | "stopped" | "event" | "achieve" | "expand" | "built" | "mission";
export interface Fx { id: number; kind: FxKind; text: string; age: number; }
export interface ActiveEvent { id: string; left: number; }
export interface FloatMoney { id: number; amt: number; age: number; x?: number; y?: number; txt?: string }
export type Bottleneck = "NORMAL" | "LOW STOCK" | "CHECKOUT BOTTLENECK" | "RESTOCK BOTTLENECK" | "CUSTOMER DEMAND EXCEEDS CAPACITY";
export interface CoreData { tier: number; cash: number; lifetimeRevenue: number; totalCustomersServed: number; earningsPerSecond: number; lastSavedTimestamp: number; aisles: AisleState[]; checkouts: CheckoutState[]; restockers: RestockerState[]; decors: DecorState[]; storeroom: Record<AisleType, number>; orders: Order[]; standing: Record<AisleType, Standing>;
  /** Everything below was added after v1 saves existed; the loader fills defaults for old saves. */
  xp: number; staff: StaffState[]; lifetimeExpenses: number; satisfaction: number; cleanliness: number; clock: number; event: ActiveEvent | null;
  objectiveStep: number; achievements: string[]; thefts: number; theftsPrevented: number; gems: number; cosmetics: string[]; adsRemoved: boolean; }
export interface SimData extends CoreData { revPerSec: number; expPerSec: number; recentThief: number; recentBalk: number; customers: Customer[]; crew: Walker[]; floats: FloatMoney[]; fx: Fx[]; spawnAcc: number; nextId: number; }
export interface GameState extends SimData {
  customersInStore: number; customersInQueue: number; isInitialized: boolean; speed: number;
  offline: { seconds: number; earnings: number } | null; lastUpgrade: string | null;
  hireStaff: (role: StaffRole) => void; upgradeStaff: (id: string) => void; claimObjective: () => void; toast: (text: string, kind?: FxKind) => void;
  upgradeAisle: (id: string) => void; upgradeCheckout: (id: string) => void; upgradeRestocker: (id: string) => void;
  buyItem: (kind: ItemKind, type: AisleType | undefined, x: number, y: number, style?: string) => void; moveItem: (kind: ItemKind, id: string, x: number, y: number) => void; sellItem: (kind: ItemKind, id: string) => void;
  assignRestocker: (id: string, aisleId: string) => void; restockAisle: (id: string) => "ok" | "empty" | "full";
  simulateTick: (dt: number) => void; saveGame: () => void; loadGame: () => void; resetGame: () => void;
  collectOffline: () => void; expandStore: () => void; orderStock: (type: AisleType, qty: number) => void; setStanding: (type: AisleType, patch: Partial<Standing>) => void; setSpeed: (n: number) => void; debug: (cmd: string) => void;
}

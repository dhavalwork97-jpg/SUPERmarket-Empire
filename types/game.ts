export type AisleType = "produce" | "bakery" | "electronics" | "refrigerated" | "freezer" | "deli";
export interface AisleState { id: string; type: AisleType; level: number; stock: number; maxStock: number; baseRevenue: number; demandRate: number; stockConsumptionRate: number; upgradeCost: number; x: number; y: number; }
export interface CheckoutState { id: string; level: number; processingTime: number; queueCapacity: number; currentCustomerProgress: number; customersProcessed: number; upgradeCost: number; x: number; y: number; }
export interface RestockerState { id: string; level: number; restockAmount: number; cooldown: number; currentCooldown: number; assignedAisleId: string | null; upgradeCost: number; x: number; y: number; }
export type ItemKind = "aisle" | "checkout" | "restocker" | "decor";
export interface Order { id: number; type: AisleType; qty: number; eta: number; cost: number; }
export interface Standing { on: boolean; below: number; qty: number; }
export interface DecorState { id: string; x: number; y: number; }
export type CustomerPhase = "ENTERING" | "SHOPPING" | "QUEUING" | "CHECKOUT" | "LEAVING";
export interface Customer { id: number; phase: CustomerPhase; t: number; wait: number; basket: number; co: string | null; mood: string; plan: string[]; }
export interface FloatMoney { id: number; amt: number; age: number; }
export type Bottleneck = "NORMAL" | "LOW STOCK" | "CHECKOUT BOTTLENECK" | "RESTOCK BOTTLENECK" | "CUSTOMER DEMAND EXCEEDS CAPACITY";
export interface CoreData { tier: number; cash: number; lifetimeRevenue: number; totalCustomersServed: number; earningsPerSecond: number; lastSavedTimestamp: number; aisles: AisleState[]; checkouts: CheckoutState[]; restockers: RestockerState[]; decors: DecorState[]; storeroom: Record<AisleType, number>; orders: Order[]; standing: Record<AisleType, Standing>; }
export interface SimData extends CoreData { customers: Customer[]; floats: FloatMoney[]; spawnAcc: number; nextId: number; }
export interface GameState extends SimData {
  customersInStore: number; customersInQueue: number; isInitialized: boolean; speed: number;
  offline: { seconds: number; earnings: number } | null; lastUpgrade: string | null;
  upgradeAisle: (id: string) => void; upgradeCheckout: (id: string) => void; upgradeRestocker: (id: string) => void;
  buyItem: (kind: ItemKind, type: AisleType | undefined, x: number, y: number) => void; moveItem: (kind: ItemKind, id: string, x: number, y: number) => void; sellItem: (kind: ItemKind, id: string) => void;
  assignRestocker: (id: string, aisleId: string) => void;
  simulateTick: (dt: number) => void; saveGame: () => void; loadGame: () => void; resetGame: () => void;
  collectOffline: () => void; expandStore: () => void; orderStock: (type: AisleType, qty: number) => void; setStanding: (type: AisleType, patch: Partial<Standing>) => void; setSpeed: (n: number) => void; debug: (cmd: string) => void;
}

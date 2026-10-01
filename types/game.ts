export type AisleType = "produce" | "bakery" | "electronics";
export interface AisleState { id: string; type: AisleType; level: number; stock: number; maxStock: number; baseRevenue: number; demandRate: number; stockConsumptionRate: number; upgradeCost: number; }
export interface CheckoutState { id: string; level: number; processingTime: number; queueCapacity: number; currentCustomerProgress: number; customersProcessed: number; upgradeCost: number; }
export interface RestockerState { id: string; level: number; restockAmount: number; cooldown: number; currentCooldown: number; assignedAisleId: string | null; upgradeCost: number; }
export type CustomerPhase = "ENTERING" | "SHOPPING" | "QUEUING" | "CHECKOUT" | "LEAVING";
export interface Customer { id: number; phase: CustomerPhase; t: number; wait: number; basket: number; co: string | null; mood: string; }
export interface FloatMoney { id: number; amt: number; age: number; }
export type Bottleneck = "NORMAL" | "LOW STOCK" | "CHECKOUT BOTTLENECK" | "RESTOCK BOTTLENECK" | "CUSTOMER DEMAND EXCEEDS CAPACITY";
export interface CoreData { cash: number; lifetimeRevenue: number; totalCustomersServed: number; earningsPerSecond: number; lastSavedTimestamp: number; aisles: AisleState[]; checkouts: CheckoutState[]; restockers: RestockerState[]; }
export interface SimData extends CoreData { customers: Customer[]; floats: FloatMoney[]; spawnAcc: number; nextId: number; }
export interface GameState extends SimData {
  customersInStore: number; customersInQueue: number; isInitialized: boolean; speed: number;
  offline: { seconds: number; earnings: number } | null; lastUpgrade: string | null;
  upgradeAisle: (id: string) => void; upgradeCheckout: (id: string) => void; upgradeRestocker: (id: string) => void;
  assignRestocker: (id: string, aisleId: string) => void;
  simulateTick: (dt: number) => void; saveGame: () => void; loadGame: () => void; resetGame: () => void;
  collectOffline: () => void; setSpeed: (n: number) => void; debug: (cmd: string) => void;
}

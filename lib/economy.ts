export const getUpgradeCost = (base: number, mult: number, level: number) => Math.ceil(base * Math.pow(mult, Math.max(0, level)));
export const getAisleRevenue = (base: number, level: number) => base * (1 + 0.25 * Math.max(0, level - 1)) * Math.pow(1.01, Math.max(0, level - 1));
export const getAisleMaxStock = (base: number, level: number) => base + 10 * Math.max(0, level - 1);
export const getCheckoutProcessingTime = (base: number, level: number) => Math.max(0.4, base * Math.pow(0.92, Math.max(0, level - 1)));
export const getCheckoutCapacity = (base: number, level: number) => base + Math.max(0, level - 1) * 1;
export const getRestockAmount = (base: number, level: number) => base + Math.max(0, level - 1) * 5;
export const getRestockCooldown = (base: number, level: number) => base * Math.pow(0.9, Math.max(0, level - 1));
export const getCustomerDemand = (storeLevel: number, base = 0.12) => base * Math.sqrt(Math.max(0, storeLevel));
export const calculateEPS = (prev: number, revenueThisTick: number, dt: number) => {
  const v = prev + (revenueThisTick / dt - prev) * Math.min(1, dt / 8);
  return Number.isFinite(v) && v > 0 ? v : 0;
};
export const calculateOfflineEarnings = (eps: number, elapsed: number, max: number) =>
  Math.max(0, eps) * Math.max(0, Math.min(Number.isFinite(elapsed) ? elapsed : 0, max));

/** Future monetization seam. NOTHING here talks to an ad/IAP SDK. A real provider would implement these interfaces and be swapped in
 *  at startup via setProviders(); the game already stores gems / cosmetics / adsRemoved in the save so no migration will be needed. */
export type RewardKind = "cash-boost" | "double-offline" | "free-upgrade";
export interface RewardedAdProvider { isReady(kind: RewardKind): boolean; show(kind: RewardKind): Promise<{ granted: boolean }>; }
export interface PurchaseProvider { buy(sku: string): Promise<{ ok: boolean }>; restore(): Promise<string[]>; }
export const NoAds: RewardedAdProvider = { isReady: () => false, show: async () => ({ granted: false }) };
export const NoPurchases: PurchaseProvider = { buy: async () => ({ ok: false }), restore: async () => [] };
export const providers = { ads: NoAds as RewardedAdProvider, purchases: NoPurchases as PurchaseProvider };
export const setProviders = (p: Partial<typeof providers>) => Object.assign(providers, p);
/** SKUs the save/store can grant later (cosmetic ids go in `cosmetics`, premium currency in `gems`). */
export const SKUS = { removeAds: "remove_ads", gemsSmall: "gems_small", expansionPack: "expansion_pack_1" } as const;

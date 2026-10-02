"use client";

import { AisleState, CheckoutState } from "@/types/game";

type Props = { cols: number; rows: number; aisles: AisleState[]; checkouts: CheckoutState[]; tier?: number };
const pctX = (x: number, cols: number) => ((x + 0.5) / cols) * 100;
const pctY = (y: number, rows: number) => ((y + 0.5) / rows) * 100;

export default function StoreEnvironment({ cols, rows, aisles, checkouts, tier = 0 }: Props) {
  const lightCount = Math.max(4, Math.ceil(cols / 2));
  return <div className="store-environment" aria-hidden="true">
    <div className="store-bg-art" />
    <div className="store-back-wall">
      <div className="wall-sign">{tier >= 2 ? "MEGA MARKET • FRESH • QUALITY" : tier === 1 ? "FRESH • QUALITY • EVERY DAY" : "WELCOME • FRESH • QUALITY"}</div>
      <div className="ceiling-lights">{Array.from({ length: lightCount }, (_, i) => <i key={i} style={{ left: ((i + 0.5) / lightCount) * 100 + "%" }} />)}</div>
    </div>
    <div className="store-floor-surface" />
    <div className="store-aisle-shadow-layer">
      {aisles.filter(a => a.level > 0).map(a => (
        <i key={a.id} className="aisle-footprint" style={{ left: pctX(a.x, cols) + "%", top: pctY(a.y, rows) + "%", width: Math.min(15, 9.5 + a.level * 0.35) + "%", height: Math.min(11, 6.5 + a.level * 0.25) + "%", opacity: Math.min(0.34, 0.16 + a.level * 0.018) }} />
      ))}
    </div>
    <div className="store-checkout-zone">
      <span className="checkout-zone-label">CHECKOUT</span>
      {checkouts.filter(c => c.level > 0).map(c => <i key={c.id} style={{ left: pctX(c.x, cols) + "%", top: pctY(c.y, rows) + "%" }} />)}
    </div>
    <div className="store-stockroom"><span>STOCKROOM</span><b /><b /><b /></div>
    <div className="store-entry-mat"><span>WELCOME</span></div>
  </div>;
}

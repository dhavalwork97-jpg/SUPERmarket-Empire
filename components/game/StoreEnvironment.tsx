"use client";

import { AisleState, CheckoutState } from "@/types/game";

type Props = { cols: number; rows: number; aisles: AisleState[]; checkouts: CheckoutState[] };
const pctX = (x: number, cols: number) => ((x + 0.5) / cols) * 100;
const pctY = (y: number, rows: number) => ((y + 0.5) / rows) * 100;

export default function StoreEnvironment({ cols, rows, aisles, checkouts }: Props) {
  const lightCount = Math.max(4, Math.ceil(cols / 2));
  return <div className="store-environment" aria-hidden="true">
    <div className="store-back-wall">
      <div className="wall-sign">FRESH • QUALITY • EVERY DAY</div>
      <div className="ceiling-lights">{Array.from({ length: lightCount }, (_, i) => <i key={i} style={{ left: ((i + 0.5) / lightCount) * 100 + "%" }} />)}</div>
    </div>
    <div className="store-floor-surface" />
    <div className="store-checkout-zone">
      <span className="checkout-zone-label">CHECKOUT</span>
      {checkouts.filter(c => c.level > 0).map(c => <i key={c.id} style={{ left: pctX(c.x, cols) + "%", top: pctY(c.y, rows) + "%" }} />)}
    </div>
    <div className="store-stockroom"><span>STOCKROOM</span><b /><b /><b /></div>
    <div className="store-entry-mat"><span>WELCOME</span></div>
  </div>;
}

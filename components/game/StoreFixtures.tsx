"use client";

import { AisleState, CheckoutState } from "@/types/game";

type Props = { cols: number; rows: number; aisles: AisleState[]; checkouts: CheckoutState[] };

const px = (v: number, total: number) => ((v + 0.5) / total) * 100;

export default function StoreFixtures({ cols, rows, aisles, checkouts }: Props) {
  return (
    <div className="store-fixtures" aria-hidden="true">
      {aisles.map((a) => (
        <div
          key={a.id}
          className={"fixture-aisle fixture-" + a.type}
          style={{ left: px(a.x, cols) + "%", top: px(a.y, rows) + "%" }}
        >
          <span className="fixture-shadow" />
          <span className="fixture-plinth" />
          <span className="fixture-shelf"><i /><i /><i /></span>
          <span className="fixture-label">
            {a.type === "refrigerated" || a.type === "freezer" ? "COLD" : a.type.toUpperCase()}
          </span>
        </div>
      ))}
      {checkouts.filter((c) => c.level > 0).map((c) => (
        <div
          key={c.id}
          className="fixture-checkout"
          style={{ left: px(c.x, cols) + "%", top: px(c.y, rows) + "%" }}
        >
          <span className="checkout-belt" />
          <span className="checkout-base" />
        </div>
      ))}
    </div>
  );
}

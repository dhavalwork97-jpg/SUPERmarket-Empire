"use client";
import { useState } from "react";
import { useGame } from "@/store/store";
import { AISLE_DEFS, AISLE_ORDER, DELIVERY_TIME } from "@/lib/constants";
import { orderCost } from "@/lib/simulation";
import { formatMoney } from "@/lib/formatting";
export default function SupplyPanel() {
  const s = useGame(); const [qty, setQty] = useState<Record<string, number>>({});
  const types = AISLE_ORDER.filter((t) => s.aisles.some((a) => a.type === t));
  return (<div className="card"><h3>📋 SUPPLY ORDERS <span className="lvl">Delivery {DELIVERY_TIME}s</span></h3>
    {types.map((t) => {
      const sh = s.aisles.filter((a) => a.type === t), cap = sh.reduce((n, a) => n + a.maxStock, 0), on = Math.floor(sh.reduce((n, a) => n + a.stock, 0));
      const room = Math.floor(s.storeroom[t]), inbound = s.orders.filter((o) => o.type === t).reduce((n, o) => n + o.qty, 0), st = s.standing[t], q = qty[t] ?? 50, cost = orderCost(t, q);
      return (<div key={t} className="supply"><div className="lbl">{AISLE_DEFS[t].emoji} {AISLE_DEFS[t].name}: shelves {on}/{cap} · storeroom {room} · inbound {inbound}</div>
        <div className="row">{[10, 50, 100, 300].map((n) => <button key={n} className={`small ${q === n ? "on" : ""}`} onClick={() => setQty({ ...qty, [t]: n })}>{n}</button>)}
          <button className="small" onClick={() => setQty({ ...qty, [t]: Math.max(10, cap - on - room - inbound) })}>Fill</button>
          <button className="btn" disabled={s.cash < cost} onClick={() => s.orderStock(t, q)}>Order {q} · {formatMoney(cost)}</button></div>
        <label className="lbl"><input type="checkbox" checked={st.on} onChange={(e) => s.setStanding(t, { on: e.target.checked })} /> Auto-reorder{" "}
          <select value={st.qty} onChange={(e) => s.setStanding(t, { qty: Number(e.target.value) })}>{[25, 50, 100, 300].map((n) => <option key={n} value={n}>{n}</option>)}</select> when below{" "}
          <select value={st.below} onChange={(e) => s.setStanding(t, { below: Number(e.target.value) })}>{[0.2, 0.4, 0.6].map((n) => <option key={n} value={n}>{n * 100}%</option>)}</select></label></div>); })}</div>);
}

"use client";
import { useGame } from "@/store/store";
import { useUI } from "@/store/ui";
import { AISLE_DEFS } from "@/lib/constants";
import { placeCost, analyzeLayout } from "@/lib/simulation";
import { getAisleRevenue } from "@/lib/economy";
import { formatMoney } from "@/lib/formatting";
import { DECOR, aisleSprite, checkoutSprite, char } from "@/lib/assets";
import { cashierByLane } from "@/lib/staff";
import { DecorImg } from "./Asset";

/** What you get when you tap something in the world: that object's numbers and its few relevant actions, nothing else. */
export default function ContextCard() {
  const s = useGame(), { sel, select, decorStyle, setDecor, open } = useUI();
  if (!sel) return null;
  const done = <button className="small ghost" onClick={() => select(null)}>Done</button>;
  if (sel.mode === "new") {
    const cost = placeCost(s, sel.kind, sel.type), name = sel.kind === "aisle" ? AISLE_DEFS[sel.type!].name : sel.kind[0].toUpperCase() + sel.kind.slice(1);
    return (<aside className="ctx" aria-live="polite"><div className="ctx-h"><b>Place {name}</b><span className="lvl">{formatMoney(cost)}</span>{done}</div>
      <div className="lbl dim">Tap an empty floor tile. Shoppers route around it automatically.</div>
      {sel.kind === "decor" && <div className="decorbar">{DECOR.map((d) => <button key={d.id} className={`small dchip ${decorStyle === d.id ? "on" : ""}`} onClick={() => setDecor(d.id)}><DecorImg id={d.id} className="bthumb" /><span>{d.name}</span></button>)}</div>}</aside>);
  }
  const list = ({ aisle: s.aisles, checkout: s.checkouts, restocker: s.restockers, decor: s.decors } as Record<string, any[]>)[sel.kind], it = list.find((i) => i.id === sel.id);
  if (!it) return null;
  if (sel.mode === "move") return <aside className="ctx"><div className="ctx-h"><b>Move to…</b>{done}</div><div className="lbl dim">Tap an empty tile.</div></aside>;
  const refund = Math.floor(0.5 * placeCost(s, sel.kind, it.type, -1));
  const move = <button className="small" onClick={() => select({ mode: "move", kind: sel.kind, id: sel.id })}>Move</button>;
  const sell = <button className="small" onClick={() => { s.sellItem(sel.kind, sel.id); select(null); }}>Sell +{formatMoney(refund)}</button>;
  const up = (cost: number, fn: () => void) => <button className="btn" disabled={s.cash < cost} onClick={fn}>Upgrade · {formatMoney(cost)}</button>;
  if (sel.kind === "aisle") { const d = AISLE_DEFS[it.type as keyof typeof AISLE_DEFS], pct = it.maxStock ? it.stock / it.maxStock : 0, room = s.storeroom[it.type as keyof typeof s.storeroom], blocked = !isFinite(analyzeLayout(s).dist.E?.[it.id]);
    return (<aside className="ctx"><div className="ctx-h"><img src={aisleSprite(it.type, it.level, pct)} alt="" className="cthumb" /><b>{d.name} #{it.id.slice(1)}</b><span className="lvl">Lv {it.level}</span>{done}</div>
      <div className="lbl">Stock {Math.round(pct * 100)}% <span className="dim">({Math.floor(it.stock)}/{it.maxStock})</span> · {formatMoney(getAisleRevenue(it.baseRevenue, it.level))}/customer</div>
      <div className="bar"><i style={{ width: `${pct * 100}%`, background: pct < 0.25 ? "#ef4444" : "#22c55e" }} /></div>
      {blocked && <div className="lbl oos">⛔ Customers can't reach this shelf. Open a path to it.</div>}
      <div className="ctx-a">{up(it.upgradeCost, () => s.upgradeAisle(it.id))}<button className="btn alt" disabled={pct >= 0.995 || room < 1} onClick={() => s.restockAisle(it.id)}>Restock{room < 1 ? " · storeroom empty" : ""}</button>{move}{sell}</div></aside>); }
  if (sel.kind === "checkout") { const q = s.customers.filter((c) => c.co === it.id).length, cashier = cashierByLane(s.staff, s.checkouts)[it.id], blocked = !isFinite(analyzeLayout(s).dist.E?.[it.id]);
    return (<aside className="ctx"><div className="ctx-h"><img src={checkoutSprite(it.level)} alt="" className="cthumb" /><b>Checkout #{it.id.slice(1)}</b><span className="lvl">Lv {it.level}</span>{done}</div>
      <div className="lbl">Queue {q}/{it.queueCapacity} · {it.processingTime.toFixed(1)}s per customer · Cashier: <b>{cashier ? `Level ${cashier.level}` : "none"}</b></div>
      <div className="bar"><i style={{ width: `${it.currentCustomerProgress * 100}%`, background: "#3b82f6" }} /></div>
      {blocked && <div className="lbl oos">⛔ Customers can't reach this checkout.</div>}
      <div className="ctx-a">{up(it.upgradeCost, () => s.upgradeCheckout(it.id))}{!cashier && <button className="btn alt" onClick={() => open("staff")}>Assign staff</button>}{move}{sell}</div></aside>); }
  if (sel.kind === "restocker") return (<aside className="ctx"><div className="ctx-h"><img src={char("restocker")} alt="" className="cthumb" /><b>Restocker #{it.id.slice(1)}</b><span className="lvl">Lv {it.level}</span>{done}</div>
    <div className="lbl">{it.assignedAisleId ? `Fills shelf #${it.assignedAisleId.slice(1)}` : "Auto: fills the emptiest shelf"} · wage {formatMoney(it.salary ?? 0)}/s</div>
    <div className="ctx-a">{up(it.upgradeCost, () => s.upgradeRestocker(it.id))}{move}{sell}</div></aside>);
  return (<aside className="ctx"><div className="ctx-h"><b>Decor</b>{done}</div><div className="lbl dim">+10% sales to shelves within 2 tiles.</div><div className="ctx-a">{move}{sell}</div></aside>);
}

"use client";
import { useGame } from "@/store/store";
import { AISLE_DEFS } from "@/lib/constants";
import { formatMoney } from "@/lib/formatting";
import { Customer } from "@/types/game";
const hash = (n: number) => ((n * 2654435761) % 1000) / 1000;
const CX: Record<string, number> = { c1: 30, c2: 70 };
export default function StoreView() {
  const customers = useGame((s) => s.customers), aisles = useGame((s) => s.aisles), floats = useGame((s) => s.floats), checkouts = useGame((s) => s.checkouts);
  const queues: Record<string, Customer[]> = { c1: [], c2: [] };
  for (const c of customers) if (c.co && (c.phase === "QUEUING" || c.phase === "CHECKOUT")) queues[c.co]?.push(c);
  for (const k in queues) queues[k].sort((a, b) => (a.phase === "CHECKOUT" ? -1 : 0) - (b.phase === "CHECKOUT" ? -1 : 0));
  const pos = (c: Customer) => {
    const h = hash(c.id);
    if (c.phase === "ENTERING") return { left: 4 + h * 10, top: 60 - c.t * 8 };
    if (c.phase === "SHOPPING") return { left: 8 + h * 84, top: 22 + hash(c.id + 7) * 22 };
    if (c.co && queues[c.co]) { const i = queues[c.co].indexOf(c); return { left: CX[c.co] + (i === 0 ? 0 : (i % 2 ? -1 : 1) * 1.2), top: Math.max(46, 76 - i * 4.5) }; }
    return { left: 94, top: 82 };
  };
  return (<div className="floor"><div className="aisles">{aisles.map((a) => <div key={a.id} className={`zone ${a.level === 0 ? "off" : ""}`}>{AISLE_DEFS[a.type].emoji} {AISLE_DEFS[a.type].name}{a.level > 0 && a.stock <= 0 && <b> ❗</b>}</div>)}</div>
    {checkouts.map((k) => <div key={k.id} className={`station ${k.level === 0 ? "off" : ""}`} style={{ left: `${CX[k.id]}%` }}>
      <span className="qcount">{k.level === 0 ? "locked" : `${queues[k.id].length}/${k.queueCapacity}`}</span>
      <div className="desk">🧾 #{k.id.slice(1)}<div className="bar"><i style={{ width: `${k.currentCustomerProgress * 100}%`, background: "#60a5fa" }} /></div></div></div>)}
    {customers.slice(0, 120).map((c) => { const p = pos(c); return <span key={c.id} className="cust" style={{ left: `${p.left}%`, top: `${p.top}%` }}>{c.mood}</span>; })}
    {floats.map((f) => <span key={f.id} className="float" style={{ left: `${(checkouts.find((k) => k.level > 0 && hash(f.id) < 0.5)?.id ?? "c1") === "c1" ? 22 : 62}%`, opacity: Math.min(1, 1.6 - f.age / 1.2), top: `${70 - f.age * 22}%` }}>+{formatMoney(f.amt)}</span>)}</div>);
}

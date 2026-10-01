"use client";
import { useState } from "react";
import { useGame } from "@/store/store";
import { AISLE_DEFS, AISLE_ORDER, TIERS } from "@/lib/constants";
import { placeCost, analyzeLayout } from "@/lib/simulation";
import { formatMoney } from "@/lib/formatting";
import { AisleType, Customer, ItemKind } from "@/types/game";
const hash = (n: number) => ((n * 2654435761) % 1000) / 1000;
type Sel = { mode: "new"; kind: ItemKind; type?: AisleType } | { mode: "move" | "item"; kind: ItemKind; id: string } | null;
export default function StoreView() {
  const s = useGame(); const { customers, aisles, checkouts, restockers, floats, tier, cash } = s;
  const [sel, setSel] = useState<Sel>(null);
  const { cols, rows } = TIERS[tier]; const L = analyzeLayout(s);
  const cell = new Map<string, { kind: ItemKind; id: string; e: string; lvl: number; bar?: number; note?: string }>();
  aisles.forEach((a) => cell.set(`${a.x},${a.y}`, { kind: "aisle", id: a.id, e: AISLE_DEFS[a.type].emoji, lvl: a.level, bar: a.stock / a.maxStock, note: (a.stock <= 0 ? "❗" : "") + (isFinite(L.dist.E?.[a.id]) ? "" : "⛔") }));
  checkouts.forEach((k) => cell.set(`${k.x},${k.y}`, { kind: "checkout", id: k.id, e: "🧾", lvl: k.level, bar: k.currentCustomerProgress, note: isFinite(L.dist.E?.[k.id]) ? "" : "⛔" }));
  s.decors.forEach((d) => cell.set(`${d.x},${d.y}`, { kind: "decor", id: d.id, e: "🪴", lvl: 0 }));
  restockers.forEach((r) => cell.set(`${r.x},${r.y}`, { kind: "restocker", id: r.id, e: "📦", lvl: r.level }));
  const cx = (x: number) => ((x + 0.5) / cols) * 100, cy = (y: number) => ((y + 0.5) / rows) * 100;
  const queues: Record<string, Customer[]> = Object.fromEntries(checkouts.map((k) => [k.id, [] as Customer[]]));
  for (const c of customers) if (c.co && (c.phase === "QUEUING" || c.phase === "CHECKOUT")) queues[c.co]?.push(c);
  for (const k in queues) queues[k].sort((a, b) => (a.phase === "CHECKOUT" ? -1 : 0) - (b.phase === "CHECKOUT" ? -1 : 0));
  const pos = (c: Customer) => {
    const h = hash(c.id);
    if (c.phase === "ENTERING") return { left: 3 + h * 6, top: 100 - c.t * 6 };
    if (c.phase === "SHOPPING") { const a = aisles[Math.floor(h * aisles.length)]; return a ? { left: cx(a.x) + (hash(c.id + 3) - 0.5) * 6, top: cy(a.y) + 4 } : { left: 50, top: 50 }; }
    const k = checkouts.find((z) => z.id === c.co), i = c.co ? queues[c.co].indexOf(c) : 0;
    if (k) return { left: cx(k.x) + (i % 2 ? -1 : 1) * 1.5, top: Math.max(4, cy(k.y) - 6 - i * 4.5) };
    return { left: 96, top: 95 };
  };
  const click = (x: number, y: number) => {
    const it = cell.get(`${x},${y}`);
    if (it) { setSel({ mode: "item", kind: it.kind, id: it.id }); return; }
    if (sel?.mode === "new") s.buyItem(sel.kind, sel.type, x, y);
    else if (sel?.mode === "move") { s.moveItem(sel.kind, sel.id, x, y); setSel(null); }
  };
  const builds: { label: string; kind: ItemKind; type?: AisleType }[] = [...AISLE_ORDER.slice(0, TIERS[tier].aisles).map((t) => ({ label: `${AISLE_DEFS[t].emoji} ${AISLE_DEFS[t].name}`, kind: "aisle" as const, type: t })),
    { label: "🧾 Checkout", kind: "checkout" }, { label: "📦 Restocker", kind: "restocker" }, { label: "🪴 Decor", kind: "decor" }];
  const chosen = sel?.mode === "item" || sel?.mode === "move" ? ((s as any)[{ aisle: "aisles", checkout: "checkouts", restocker: "restockers", decor: "decors" }[sel.kind]] as any[]).find((i) => i.id === sel.id) : null;
  const refund = chosen && sel ? Math.floor(0.5 * placeCost(s, sel.kind, chosen.type, -1)) : 0;
  const active = checkouts.filter((k) => k.level > 0);
  return (<div className="storewrap"><div className="buildbar">{builds.map((b) => { const c = placeCost(s, b.kind, b.type), on = sel?.mode === "new" && sel.kind === b.kind && sel.type === b.type;
      return <button key={b.label} disabled={cash < c} className={`small ${on ? "on" : ""}`} onClick={() => setSel(on ? null : { mode: "new", ...b })}>{b.label} · {formatMoney(c)}</button>; })}</div>
    <div className="hint">{sel?.mode === "new" ? "Tap an empty tile to place it (tap again to buy more)." : sel?.mode === "move" ? "Tap an empty tile to move it there." : sel?.mode === "item" && chosen ? "" : "Pick something to build, or tap an item to move or sell it. 🚪 entrance · ⛔ customers cannot reach it · decor boosts shelves within 2 tiles."}
      {sel?.mode === "item" && chosen && <>Selected {sel.kind} #{sel.id.slice(1)} <button className="small" onClick={() => setSel({ ...sel, mode: "move" })}>Move</button> <button className="small" onClick={() => { s.sellItem(sel.kind, sel.id); setSel(null); }}>Sell +{formatMoney(refund)}</button> <button className="small" onClick={() => setSel(null)}>Cancel</button></>}</div>
    <div className="floor" style={{ aspectRatio: `${cols}/${rows}` }}>
      <div className="tiles" style={{ gridTemplateColumns: `repeat(${cols},1fr)`, gridTemplateRows: `repeat(${rows},1fr)` }}>
        {Array.from({ length: cols * rows }, (_, n) => { const x = n % cols, y = Math.floor(n / cols), it = cell.get(`${x},${y}`), picked = sel && "id" in sel && it?.id === sel.id;
          return <button key={n} className={`tile ${it ? "has" : ""} ${picked ? "picked" : ""}`} onClick={() => click(x, y)}>{it && <><span>{it.e}{it.note}</span>{it.lvl > 0 && <small>L{it.lvl}</small>}{it.bar !== undefined && <i className="mini"><b style={{ width: `${Math.min(1, it.bar) * 100}%` }} /></i>}</>}{!it && x === 0 && y === rows - 1 && <span>🚪</span>}</button>; })}</div>
      {customers.slice(0, 120).map((c) => { const p = pos(c); return <span key={c.id} className="cust" style={{ left: `${p.left}%`, top: `${p.top}%` }}>{c.mood}</span>; })}
      {floats.map((f) => { const k = active[Math.floor(hash(f.id) * active.length)]; return <span key={f.id} className="float" style={{ left: `${k ? cx(k.x) - 4 : 30}%`, opacity: Math.min(1, 1.6 - f.age / 1.2), top: `${(k ? cy(k.y) : 70) - f.age * 15}%` }}>+{formatMoney(f.amt)}</span>; })}</div></div>);
}

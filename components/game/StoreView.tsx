"use client";
import { useState } from "react";
import { useGame } from "@/store/store";
import { AISLE_DEFS, AISLE_ORDER, TIERS } from "@/lib/constants";
import { placeCost, analyzeLayout } from "@/lib/simulation";
import { formatMoney } from "@/lib/formatting";
import { DECOR, aisleSprite, checkoutSprite, char, floorTile, floorDirty, entranceDoors, fxImg, asset, icon } from "@/lib/assets";
import { cashierByLane } from "@/lib/staff";
import { CUSTOMERS } from "@/lib/customers";
import { AisleType, Customer, ItemKind } from "@/types/game";
import { Icon, DecorImg } from "./Asset";
import StoreEnvironment from "./StoreEnvironment";
import StoreFixtures from "./StoreFixtures";
const hash = (n: number) => ((Math.abs(n) * 2654435761) % 1000) / 1000;
type Sel = { mode: "new"; kind: ItemKind; type?: AisleType } | { mode: "move" | "item"; kind: ItemKind; id: string } | null;
type P = { x: number; y: number };
const lerp = (a: P, b: P, f: number): P => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
const BUBBLE: Record<string, "angry" | "happy" | "coin" | "alert" | undefined> = { "😡": "angry", "💚": "happy", "💵": "coin", "❗": "alert", "🛡️": "alert" };
const KIND_TAG: Record<string, string> = { vip: "★", impatient: "⏱", budget: "¢", impulse: "!" };

export default function StoreView() {
  const s = useGame(); const { customers, aisles, checkouts, restockers, floats, tier, cash, staff, clock, cleanliness, fx } = s;
  const [sel, setSel] = useState<Sel>(null); const [decorStyle, setDecorStyle] = useState<string>(DECOR[0].id);
  const { cols, rows } = TIERS[tier]; const L = analyzeLayout(s);
  const E: P = { x: 0, y: rows - 1 };
  const th = 100 / rows; // one tile's height in % of the floor; sprites are sized from this so they scale with the screen
  const lanes = cashierByLane(staff, checkouts);
  const cell = new Map<string, { kind: ItemKind; id: string; lvl: number; bar?: number; badge?: string; item: React.ReactNode }>();
  aisles.forEach((a) => { const pct = a.maxStock ? a.stock / a.maxStock : 0, low = pct > 0 && pct < 0.25, blocked = !isFinite(L.dist.E?.[a.id]);
    cell.set(`${a.x},${a.y}`, { kind: "aisle", id: a.id, lvl: a.level, bar: pct, badge: blocked ? "⛔" : undefined,
      item: <><img className={`spr ${low ? "low" : ""} ${pct <= 0 ? "oos" : ""}`} src={aisleSprite(a.type, a.level, pct)} alt={AISLE_DEFS[a.type].name} draggable={false} />
        {(low || pct <= 0) && <Icon n={pct <= 0 ? "alert" : "restock"} size={16} className="badge pulse" />}</> }); });
  checkouts.forEach((k) => { const q = customers.filter((c) => c.co === k.id).length, blocked = !isFinite(L.dist.E?.[k.id]);
    cell.set(`${k.x},${k.y}`, { kind: "checkout", id: k.id, lvl: k.level, bar: k.currentCustomerProgress, badge: blocked ? "⛔" : undefined,
      item: <><img className="spr" src={checkoutSprite(k.level)} alt="Checkout" draggable={false} /><span className={`qtag ${q >= k.queueCapacity ? "full" : ""}`}>{q}/{k.queueCapacity}</span></> }); });
  s.decors.forEach((d) => cell.set(`${d.x},${d.y}`, { kind: "decor", id: d.id, lvl: 0, item: <DecorImg id={d.style} /> }));
  restockers.forEach((r) => cell.set(`${r.x},${r.y}`, { kind: "restocker", id: r.id, lvl: r.level, item: <span className="desk-mark" /> }));
  const pos2 = (id: string): P => { const i = [...aisles, ...checkouts].find((z) => z.id === id); return i ? { x: i.x, y: i.y } : E; };
  const queues: Record<string, Customer[]> = Object.fromEntries(checkouts.map((k) => [k.id, [] as Customer[]]));
  for (const c of customers) if (c.co && (c.phase === "QUEUING" || c.phase === "CHECKOUT")) queues[c.co]?.push(c);
  for (const k in queues) queues[k].sort((a, b) => (a.phase === "CHECKOUT" ? -1 : 0) - (b.phase === "CHECKOUT" ? -1 : 0));
  const active = checkouts.filter((k) => k.level > 0);
  const lanePos = (id: string, i: number): P => { const k = checkouts.find((z) => z.id === id)!; return { x: k.x + (i % 2 ? -0.18 : 0.18), y: Math.max(-0.2, k.y - 0.55 - i * 0.3) }; };
  /** Where a customer is, in tile units, derived only from their simulation state. */
  const place = (c: Customer): P => {
    if (c.phase === "ENTERING") return { x: E.x, y: E.y + 0.55 * c.t };
    if (c.phase === "SHOPPING") {
      const stops = c.plan.map((id) => { const p = pos2(id); return { x: p.x, y: p.y + 0.4 }; });
      const last = stops[stops.length - 1] ?? E, dest = active.slice().sort((a, b) => Math.abs(a.x - last.x) + Math.abs(a.y - last.y) - (Math.abs(b.x - last.x) + Math.abs(b.y - last.y)))[0];
      const path = [E, ...stops, ...(dest ? [{ x: dest.x, y: dest.y - 0.6 }] : [])];
      const len = path.slice(1).map((p, i) => Math.abs(p.x - path[i].x) + Math.abs(p.y - path[i].y) || 0.01), total = len.reduce((a, b) => a + b, 0);
      let d = Math.min(1, Math.max(0, 1 - c.t / Math.max(0.1, c.t0))) * total;
      for (let i = 0; i < len.length; i++) { if (d <= len[i]) return lerp(path[i], path[i + 1], d / len[i]); d -= len[i]; }
      return path[path.length - 1];
    }
    if (c.phase === "LEAVING") return lerp(c.at === "E" ? { x: 1, y: E.y } : (() => { const p = pos2(c.at); return { x: p.x, y: p.y + 0.4 }; })(), { x: E.x, y: E.y + 0.5 }, 1 - Math.max(0, c.t));
    return c.co && queues[c.co] ? lanePos(c.co, Math.max(0, queues[c.co].indexOf(c))) : E;
  };
  const css = (p: P): React.CSSProperties => ({ left: `${((p.x + 0.5) / cols) * 100}%`, top: `${((p.y + 0.5) / rows) * 100}%` });
  const click = (x: number, y: number) => {
    const it = cell.get(`${x},${y}`);
    if (it) { setSel({ mode: "item", kind: it.kind, id: it.id }); return; }
    if (sel?.mode === "new") s.buyItem(sel.kind, sel.type, x, y, decorStyle);
    else if (sel?.mode === "move") { s.moveItem(sel.kind, sel.id, x, y); setSel(null); }
  };
  const thumb = (src: string) => <img src={src} alt="" className="bthumb" draggable={false} />;
  const builds: { label: string; thumb: React.ReactNode; kind: ItemKind; type?: AisleType }[] = [
    ...AISLE_ORDER.slice(0, TIERS[tier].aisles).map((t) => ({ label: AISLE_DEFS[t].name, thumb: thumb(aisleSprite(t, 1, 1)), kind: "aisle" as const, type: t })),
    { label: "Checkout", thumb: thumb(checkoutSprite(1)), kind: "checkout" }, { label: "Restocker", thumb: thumb(char("restocker")), kind: "restocker" }, { label: "Decor", thumb: <span className="bthumb"><DecorImg id={decorStyle} className="bthumb" /></span>, kind: "decor" }];
  const chosen = sel?.mode === "item" || sel?.mode === "move" ? ((s as any)[{ aisle: "aisles", checkout: "checkouts", restocker: "restockers", decor: "decors" }[sel.kind]] as any[]).find((i) => i.id === sel.id) : null;
  const refund = chosen && sel ? Math.floor(0.5 * placeCost(s, sel.kind, chosen.type, -1)) : 0;
  const cleaners = staff.filter((x) => x.role === "cleaner"), guards = staff.filter((x) => x.role === "security"), mgr = staff.find((x) => x.role === "manager");
  const stopped = fx.some((f) => f.kind === "stopped" && f.age < 2.5), dirty = Math.max(0, 0.85 - cleanliness) / 0.85; // share of tiles showing grime
  const sprite = (key: string, src: string, p: P, h: number, extra = "", style?: React.CSSProperties, children?: React.ReactNode) =>
    <span key={key} className={`actor ${extra}`} style={{ ...css(p), height: `${th * h}%`, ...style }}><img src={src} alt="" draggable={false} />{children}</span>;
  return (<div className="storewrap">
    <div className="shopsign"><img src={TIERS[tier].img} alt="" className="signimg" /><b>{TIERS[tier].name}</b><span className="open"><i /> OPEN</span></div>
    <div className="buildbar">{builds.map((b) => { const c = placeCost(s, b.kind, b.type), on = sel?.mode === "new" && sel.kind === b.kind && sel.type === b.type;
      return <button key={b.label} disabled={cash < c} className={`small bbtn ${on ? "on" : ""}`} onClick={() => setSel(on ? null : { mode: "new", ...b })}>{b.thumb}<span>{b.label}<em>{formatMoney(c)}</em></span></button>; })}</div>
    {sel?.mode === "new" && sel.kind === "decor" && <div className="decorbar">{DECOR.map((d) => <button key={d.id} title={d.name} className={`small dchip ${decorStyle === d.id ? "on" : ""}`} onClick={() => setDecorStyle(d.id)}><DecorImg id={d.id} className="bthumb" /><span>{d.name}</span></button>)}<span className="lbl dim">Each decor within 2 tiles of a shelf adds +10% to its sales (max 5).</span></div>}
    <div className="hint">{sel?.mode === "new" ? "Tap an empty tile to place it (tap again to buy more)." : sel?.mode === "move" ? "Tap an empty tile to move it there." : sel?.mode === "item" && chosen ? "" : "Pick something to build, or tap an item to move or sell it. Customers enter at the doors (bottom-left). ⛔ = customers cannot reach it."}
      {sel?.mode === "item" && chosen && <>Selected {sel.kind} #{sel.id.slice(1)} <button className="small" onClick={() => setSel({ ...sel, mode: "move" })}>Move</button> <button className="small" onClick={() => { s.sellItem(sel.kind, sel.id); setSel(null); }}>Sell +{formatMoney(refund)}</button> <button className="small" onClick={() => setSel(null)}>Cancel</button></>}</div>
    <div className="floorscroll"><div className={`floor ${sel?.mode === "new" || sel?.mode === "move" ? "build-mode" : ""}`} style={{ "--cols": cols, aspectRatio: `${cols}/${rows}` } as React.CSSProperties}>
      <StoreEnvironment cols={cols} rows={rows} aisles={aisles} checkouts={checkouts} />
      <StoreFixtures cols={cols} rows={rows} aisles={aisles} checkouts={checkouts} />
      {dirty > 0.05 && Array.from({ length: cols * rows }, (_, n) => (hash(n * 7 + 3) < dirty * 0.7 ? <img key={n} src={floorDirty} alt="" className="grime" draggable={false} style={{ left: `${((n % cols) / cols) * 100}%`, top: `${(Math.floor(n / cols) / rows) * 100}%`, width: `${100 / cols}%`, height: `${100 / rows}%` }} /> : null))}
      <div className="tiles" style={{ gridTemplateColumns: `repeat(${cols},1fr)`, gridTemplateRows: `repeat(${rows},1fr)` }}>
        {Array.from({ length: cols * rows }, (_, n) => { const x = n % cols, y = Math.floor(n / cols), it = cell.get(`${x},${y}`), picked = sel && "id" in sel && it?.id === sel.id, door = !it && x === 0 && y === rows - 1;
          return <button key={n} aria-label={it ? `${it.kind} ${it.id}` : door ? "entrance" : "empty tile"} className={`tile ${it ? "has" : ""} ${picked ? "picked" : ""}`} onClick={() => click(x, y)}>
            {it && <>{it.item}{it.badge && <span className="nb">{it.badge}</span>}{it.lvl > 0 && <small>L{it.lvl}</small>}{it.bar !== undefined && <i className="mini"><b style={{ width: `${Math.min(1, it.bar) * 100}%`, background: it.kind === "aisle" ? (it.bar < 0.25 ? "#ef4444" : "#4ade80") : "#60a5fa" }} /></i>}</>}
            {door && <><img src={entranceDoors} alt="Entrance" className="spr door" draggable={false} /><span className="doorlbl">ENTRANCE</span></>}</button>; })}</div>
      {/* staff */}
      {restockers.filter((r) => r.level > 0).map((r) => { const home = { x: r.x, y: r.y }, busy = (r.busy ?? 0) > 0 && r.target, t = busy ? pos2(r.target!) : home, p = 1 - (r.busy ?? 0) / 2.4, f = busy ? (p < 0.5 ? p * 2 : (1 - p) * 2) : 0, at = lerp(home, { x: t.x, y: t.y + 0.35 }, Math.min(1, f));
        return sprite(`r${r.id}`, char("restocker"), at, 0.95, `staff ${busy ? "walking" : "idle"}`, undefined, busy ? <Icon n="restock" size={14} className="bubble" /> : null); })}
      {Object.entries(lanes).map(([lid, c]) => { const k = checkouts.find((z) => z.id === lid)!; return sprite(`c${c.id}`, char("cashier"), { x: k.x + 0.36, y: k.y - 0.12 }, 1, "staff idle", undefined, c.workload > 0.5 ? <Icon n="speed" size={12} className="bubble" /> : null); })}
      {cleaners.map((c, i) => { const ph = i * 2.1 + 1, p = { x: (cols - 1) * (0.5 + 0.38 * Math.sin(clock * 0.11 + ph)), y: (rows - 1) * (0.5 + 0.32 * Math.sin(clock * 0.17 + ph * 1.7)) };
        return sprite(`cl${c.id}`, char("cleaner"), p, 0.95, "staff walking", undefined, <img src={fxImg("levelup-sparkle")} alt="" className="sparkle" draggable={false} />); })}
      {guards.map((g, i) => sprite(`g${g.id}`, char("guard"), { x: 1.1 + i * 0.9 + 0.5 * Math.sin(clock * 0.4 + i), y: rows - 1.35 }, 0.95, "staff walking", undefined, stopped ? <Icon n="alert" size={16} className="bubble pulse" /> : null))}
      {mgr && (() => { const a = aisles[0], k = active[0] ?? checkouts[0], from = a ? { x: a.x, y: a.y + 0.6 } : E, to = k ? { x: k.x - 0.8, y: k.y } : E, f = 0.5 + 0.5 * Math.sin(clock * 0.18);
        return sprite(`m${mgr.id}`, char("manager"), lerp(from, to, f), 0.95, "staff walking"); })()}
      {/* customers */}
      {customers.slice(0, 70).map((c) => { const p = place(c), def = CUSTOMERS[c.kind] ?? CUSTOMERS.normal, angry = c.mood === "😡", cart = c.phase !== "ENTERING" && c.phase !== "LEAVING" && hash(c.id) < 0.5, b = BUBBLE[c.mood], tag = KIND_TAG[c.kind];
        const src = c.mood === "🦹" ? char("shopper") : angry ? char("shopper-angry") : cart ? char("shopper-3") : char("shopper");
        const walking = c.phase === "ENTERING" || c.phase === "SHOPPING" || c.phase === "LEAVING";
        const nearestStop = c.plan.map((id) => pos2(id)).reduce((best, q) => { const d = Math.abs(q.x - p.x) + Math.abs(q.y - p.y); return d < best.d ? { q, d } : best; }, { q: E, d: 999 });
        const browsing = c.phase === "SHOPPING" && nearestStop.d < 0.72;
        const checkoutAction = c.phase === "CHECKOUT";
        const entering = c.phase === "ENTERING";
        const leaving = c.phase === "LEAVING";
        const queueing = c.phase === "QUEUING";
        const facingLeft = c.phase === "SHOPPING" ? (() => { const target = c.plan.find((id) => pos2(id).y >= 0); const q = target ? pos2(target) : E; return q.x < p.x; })() : c.phase === "LEAVING" ? p.x > E.x : false;
        const faceClass = facingLeft ? "face-left" : "";
        return sprite(`u${c.id}`, src, p, 0.78 * def.scale, `cust ${walking ? "walking" : "idle"} ${faceClass} ${browsing ? "browsing" : ""} ${checkoutAction ? "shopping-checkout" : ""} ${queueing ? "queueing" : ""} ${c.phase === "ENTERING" ? "fadein" : ""} ${c.mood === "🦹" ? "thief" : ""} ${cart ? "has-cart" : ""}`, { filter: def.filter, opacity: c.phase === "LEAVING" ? Math.max(0.25, c.t) : 1, zIndex: 2 + Math.round(p.y * 10), animationDelay: `${-hash(c.id * 17) * 0.55}s` },
          <>{b && c.phase !== "SHOPPING" && <Icon n={b} size={13} className="bubble" />}{tag && <i className="ktag">{tag}</i>}{browsing && <span className="browse-ring" />}{browsing && <span className="pick-bubble">PICK</span>}{checkoutAction && <span className="checkout-bubble">PAY</span>}{leaving && <span className="leave-arrow">›</span>}{entering && <span className="enter-arrow">↓</span>}{cart && <span className="cart-prop"><i /></span>}</>); })}
      {floats.map((f) => { const k = active[Math.floor(hash(f.id) * active.length)], p = k ? { x: k.x, y: k.y } : { x: 2, y: rows - 2 };
        return <span key={f.id} className="float" style={{ ...css(p), opacity: Math.min(1, 1.6 - f.age / 1.2), marginTop: `${-f.age * 28}px` }}>{f.age < 0.5 && <img src={fxImg("coin-burst")} alt="" className="burst" draggable={false} />}<img src={icon("coin")} alt="" width={14} height={14} />+{formatMoney(f.amt)}</span>; })}
    </div></div></div>);
}

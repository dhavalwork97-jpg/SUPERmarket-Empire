"use client";
import { useState } from "react";
import { useGame } from "@/store/store";
import { AISLE_DEFS, AISLE_ORDER, TIERS } from "@/lib/constants";
import { placeCost, analyzeLayout } from "@/lib/simulation";
import { formatMoney } from "@/lib/formatting";
import { DECOR, aisleSprite, checkoutSprite, char } from "@/lib/assets";
import { cashierByLane } from "@/lib/staff";
import { CUSTOMERS } from "@/lib/customers";
import { AisleType, Customer, ItemKind } from "@/types/game";
import { Icon, DecorImg } from "./Asset";
import dynamic from "next/dynamic";
import type { Actor, Marker, Float3D } from "./Store3DScene";
const Store3DScene = dynamic(() => import("./Store3DScene"), { ssr: false, loading: () => <div className="stage3d stage3d-loading">Loading supermarket…</div> });
const strSeed = (id: string) => { let h = 7; for (let i = 0; i < id.length; i++) h = (Math.imul(h ^ id.charCodeAt(i), 16777619)) | 0; return Math.abs(h) % 100000; };
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
      item: <><img className={`spr aisle-sprite ${low ? "low" : ""} ${pct <= 0 ? "oos" : ""}`} src={aisleSprite(a.type, a.level, pct)} alt={AISLE_DEFS[a.type].name} draggable={false} />
        {(low || pct <= 0) && <Icon n={pct <= 0 ? "alert" : "restock"} size={16} className="badge pulse" />}</> }); });
  checkouts.forEach((k) => { const q = customers.filter((c) => c.co === k.id).length, blocked = !isFinite(L.dist.E?.[k.id]);
    cell.set(`${k.x},${k.y}`, { kind: "checkout", id: k.id, lvl: k.level, bar: k.currentCustomerProgress, badge: blocked ? "⛔" : undefined,
      item: <><img className="spr checkout-sprite" src={checkoutSprite(k.level)} alt="Checkout" draggable={false} /><span className={`qtag ${q >= k.queueCapacity ? "full" : ""}`}>{q}/{k.queueCapacity}</span></> }); });
  s.decors.forEach((d) => cell.set(`${d.x},${d.y}`, { kind: "decor", id: d.id, lvl: 0, item: <DecorImg id={d.style} /> }));
  restockers.forEach((r) => cell.set(`${r.x},${r.y}`, { kind: "restocker", id: r.id, lvl: r.level, item: <span className="desk-mark" /> }));
  const pos2 = (id: string): P => { const i = [...aisles, ...checkouts].find((z) => z.id === id); return i ? { x: i.x, y: i.y } : E; };
  const queues: Record<string, Customer[]> = Object.fromEntries(checkouts.map((k) => [k.id, [] as Customer[]]));
  for (const c of customers) if (c.co && (c.phase === "QUEUING" || c.phase === "CHECKOUT")) queues[c.co]?.push(c);
  for (const k in queues) queues[k].sort((a, b) => (a.phase === "CHECKOUT" ? -1 : 0) - (b.phase === "CHECKOUT" ? -1 : 0));
  const active = checkouts.filter((k) => k.level > 0);
  const lanePos = (id: string, i: number): P => { const k = checkouts.find((z) => z.id === id)!; return { x: k.x + (i % 2 ? -0.18 : 0.18), y: Math.max(-0.2, k.y - 0.55 - i * 0.3) }; };
  /** Visual-only route: customers now visibly travel, pause at shelves, then continue to checkout. */
  const shoppingPath = (c: Customer): P[] => {
    const stops = c.plan.map((id) => { const p = pos2(id); return { x: p.x, y: p.y + 0.4 }; });
    const last = stops[stops.length - 1] ?? E;
    const dest = active.slice().sort((a, b) =>
      Math.abs(a.x - last.x) + Math.abs(a.y - last.y) - (Math.abs(b.x - last.x) + Math.abs(b.y - last.y))
    )[0];
    return [E, ...stops, ...(dest ? [{ x: dest.x, y: dest.y - 0.6 }] : [])];
  };
  const shoppingVisual = (c: Customer) => {
    const path = shoppingPath(c);
    const legs = path.slice(1).map((p, i) => Math.abs(p.x - path[i].x) + Math.abs(p.y - path[i].y) || 0.01);
    const pauses = path.slice(1, -1).map(() => 0.34);
    const weights = legs.map((d, i) => d + (pauses[i] ?? 0));
    const total = weights.reduce((a, b) => a + b, 0);
    let progress = Math.min(1, Math.max(0, 1 - c.t / Math.max(0.1, c.t0)));
    let u = progress * total;
    for (let i = 0; i < legs.length; i++) {
      if (u <= legs[i]) return { p: lerp(path[i], path[i + 1], u / legs[i]), walking: true, shelf: false };
      u -= legs[i];
      if (i < pauses.length) {
        if (u <= pauses[i]) return { p: path[i + 1], walking: false, shelf: true };
        u -= pauses[i];
      }
    }
    return { p: path[path.length - 1], walking: false, shelf: false };
  };
  const place = (c: Customer): P => {
    if (c.phase === "ENTERING") return { x: E.x, y: E.y + 0.55 * c.t };
    if (c.phase === "SHOPPING") return shoppingVisual(c).p;
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
    <span key={key} className={`actor ${extra}`} style={{ ...css(p), height: `${th * h}%`, zIndex: 6 + Math.round(p.y * 2), ...style }}><img src={src} alt="" draggable={false} />{children}</span>;
  // ---- hand the current state to the 3D scene: positions in tile units, the scene animates between them
  const actors: Actor[] = [], markers: Marker[] = [];
  const mk = (id: string, x: number, y: number, html: string, cls = "", h = 2.5) => markers.push({ id, x, y, html, cls, h });
  aisles.forEach((a) => { const pct = a.maxStock ? a.stock / a.maxStock : 0, low = pct > 0 && pct < 0.25, blocked = !isFinite(L.dist.E?.[a.id]);
    mk(`a${a.id}`, a.x, a.y, `${blocked ? "⛔ " : ""}${pct <= 0 ? "EMPTY " : low ? "LOW " : ""}L${a.level}<i class="mini"><b style="width:${Math.min(1, pct) * 100}%;background:${pct < 0.25 ? "#ef4444" : "#4ade80"}"></b></i>`, `m3d-tag ${pct <= 0 ? "oos" : low ? "low" : ""}`, 2.7); });
  checkouts.forEach((k) => { const q = customers.filter((c) => c.co === k.id).length, blocked = !isFinite(L.dist.E?.[k.id]);
    mk(`k${k.id}`, k.x, k.y, `${blocked ? "⛔ " : ""}L${k.level} · ${q}/${k.queueCapacity}<i class="mini"><b style="width:${Math.min(1, k.currentCustomerProgress) * 100}%;background:#60a5fa"></b></i>`, `m3d-tag ${q >= k.queueCapacity ? "full" : ""}`, 1.9); });
  mk("door", E.x, E.y + 0.35, "ENTRANCE", "m3d-door", 1.2);
  restockers.filter((r) => r.level > 0).forEach((r) => { const home = { x: r.x, y: r.y }, busy = (r.busy ?? 0) > 0 && r.target, t = busy ? pos2(r.target!) : home, p = 1 - (r.busy ?? 0) / 2.4, f = busy ? (p < 0.5 ? p * 2 : (1 - p) * 2) : 0, at = lerp({ x: home.x, y: home.y + 0.6 }, { x: t.x, y: t.y + 0.55 }, Math.min(1, f));
    actors.push({ id: `r${r.id}`, kind: "restocker", x: at.x, y: at.y, seed: strSeed(r.id) }); if (busy && f > 0.9) mk(`rb${r.id}`, at.x, at.y, "STOCK", "m3d-bubble", 2.3); });
  Object.entries(lanes).forEach(([lid, c]) => { const k = checkouts.find((z) => z.id === lid)!, serving = customers.some((u) => u.co === lid && u.phase === "CHECKOUT");
    actors.push({ id: `c${c.id}`, kind: "cashier", x: k.x + 0.36, y: k.y - 0.12, seed: strSeed(c.id) }); if (serving) mk(`cs${c.id}`, k.x + 0.36, k.y - 0.12, "SERVE", "m3d-bubble", 2.3); });
  cleaners.forEach((c, i) => { const ph = i * 2.1 + 1; actors.push({ id: `cl${c.id}`, kind: "cleaner", x: (cols - 1) * (0.5 + 0.38 * Math.sin(clock * 0.11 + ph)), y: (rows - 1) * (0.5 + 0.32 * Math.sin(clock * 0.17 + ph * 1.7)), seed: strSeed(c.id) }); });
  guards.forEach((g, i) => actors.push({ id: `g${g.id}`, kind: "guard", x: 1.1 + i * 0.9 + 0.5 * Math.sin(clock * 0.4 + i), y: rows - 1.35, seed: strSeed(g.id) }));
  if (mgr) { const a0 = aisles[0], k0 = active[0] ?? checkouts[0], from = a0 ? { x: a0.x, y: a0.y + 0.6 } : E, to = k0 ? { x: k0.x - 0.8, y: k0.y } : E, f = 0.5 + 0.5 * Math.sin(clock * 0.18), p = lerp(from, to, f); actors.push({ id: `m${mgr.id}`, kind: "manager", x: p.x, y: p.y, seed: strSeed(mgr.id) }); }
  let bubbles = 0;
  customers.slice(0, 70).forEach((c) => { const p = place(c), def = CUSTOMERS[c.kind] ?? CUSTOMERS.normal, angry = c.mood === "😡", cart = c.phase !== "ENTERING" && c.phase !== "LEAVING" && hash(c.id) < 0.5;
    actors.push({ id: `u${c.id}`, kind: "customer", x: p.x, y: p.y, cart, angry, thief: c.mood === "🦹", scale: def.scale, seed: c.id });
    const vs = c.phase === "SHOPPING" ? shoppingVisual(c) : null, txt = c.phase === "CHECKOUT" ? "PAY" : vs?.shelf ? "PICK" : angry ? "😡" : c.mood === "💚" ? "💚" : c.mood === "💵" ? "💵" : "";
    if (txt && bubbles < 22) { bubbles++; mk(`ub${c.id}`, p.x, p.y, txt, "m3d-bubble", 2.2); } });
  const floats3d: Float3D[] = floats.map((f) => { const k = active[Math.floor(hash(f.id) * active.length)], p = k ? { x: k.x, y: k.y } : { x: 2, y: rows - 2 }; return { id: f.id, x: p.x, y: p.y, amt: formatMoney(f.amt), age: f.age }; });
  return (<div className="storewrap">
    <div className="shopsign"><img src={TIERS[tier].img} alt="" className="signimg" /><b>{TIERS[tier].name}</b><span className="open"><i /> OPEN</span></div>
    <div className="buildbar">{builds.map((b) => { const c = placeCost(s, b.kind, b.type), on = sel?.mode === "new" && sel.kind === b.kind && sel.type === b.type;
      return <button key={b.label} disabled={cash < c} className={`small bbtn ${on ? "on" : ""}`} onClick={() => setSel(on ? null : { mode: "new", ...b })}>{b.thumb}<span>{b.label}<em>{formatMoney(c)}</em></span></button>; })}</div>
    {sel?.mode === "new" && sel.kind === "decor" && <div className="decorbar">{DECOR.map((d) => <button key={d.id} title={d.name} className={`small dchip ${decorStyle === d.id ? "on" : ""}`} onClick={() => setDecorStyle(d.id)}><DecorImg id={d.id} className="bthumb" /><span>{d.name}</span></button>)}<span className="lbl dim">Each decor within 2 tiles of a shelf adds +10% to its sales (max 5).</span></div>}
    <div className="hint">{sel?.mode === "new" ? "Tap an empty tile to place it (tap again to buy more)." : sel?.mode === "move" ? "Tap an empty tile to move it there." : sel?.mode === "item" && chosen ? "" : "Pick something to build, or tap an item to move or sell it. Customers enter at the doors (bottom-left). ⛔ = customers cannot reach it."}
      {sel?.mode === "item" && chosen && <>Selected {sel.kind} #{sel.id.slice(1)} <button className="small" onClick={() => setSel({ ...sel, mode: "move" })}>Move</button> <button className="small" onClick={() => { s.sellItem(sel.kind, sel.id); setSel(null); }}>Sell +{formatMoney(refund)}</button> <button className="small" onClick={() => setSel(null)}>Cancel</button></>}</div>
    <Store3DScene cols={cols} rows={rows} tier={tier} name={TIERS[tier].name} aisles={aisles} checkouts={checkouts} restockers={restockers} decors={s.decors} cleanliness={cleanliness}
      actors={actors} markers={markers} floats={floats3d} selected={sel && "id" in sel ? { kind: sel.kind, id: sel.id } : null} buildMode={sel?.mode === "new" || sel?.mode === "move"} onTile={click} />
  </div>);
}

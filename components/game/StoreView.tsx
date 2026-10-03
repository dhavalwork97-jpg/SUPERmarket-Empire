"use client";
import { useGame } from "@/store/store";
import { useUI } from "@/store/ui";
import { TIERS } from "@/lib/constants";
import { analyzeLayout } from "@/lib/simulation";
import { formatMoney } from "@/lib/formatting";
import { CUSTOMERS } from "@/lib/customers";
import { doorOf } from "@/lib/navigation";
import { cashierByLane } from "@/lib/staff";
import dynamic from "next/dynamic";
import type { Actor, Marker, Float3D } from "./Store3DScene";
const Store3DScene = dynamic(() => import("./Store3DScene"), { ssr: false, loading: () => <div className="stage3d stage3d-loading">Loading supermarket…</div> });
const strSeed = (id: string) => { let h = 7; for (let i = 0; i < id.length; i++) h = (Math.imul(h ^ id.charCodeAt(i), 16777619)) | 0; return Math.abs(h) % 100000; };

/**
 * The world. Positions come straight from the simulation (tile-centre coordinates), so what you see is exactly what the navigation grid computed:
 * this component draws, it does not decide where anyone walks. Taps become selections in the UI store.
 */
export default function StoreView() {
  const s = useGame(); const { customers, crew, aisles, checkouts, restockers, floats, tier, cleanliness, decors } = s;
  const { sel, select, decorStyle } = useUI();
  const { cols, rows } = TIERS[tier], L = analyzeLayout(s), door = doorOf(rows);
  const click = (x: number, y: number) => {
    const hit = ([["aisle", aisles], ["checkout", checkouts], ["restocker", restockers], ["decor", decors]] as const).flatMap(([k, l]) => (l as { id: string; x: number; y: number }[]).filter((i) => i.x === x && i.y === y).map((i) => ({ kind: k, id: i.id })))[0];
    if (hit) { select({ mode: "item", kind: hit.kind, id: hit.id }); return; }
    if (sel?.mode === "new") s.buyItem(sel.kind, sel.type, x, y, decorStyle);
    else if (sel?.mode === "move") { s.moveItem(sel.kind, sel.id, x, y); select({ mode: "item", kind: sel.kind, id: sel.id }); }
    else if (sel) select(null);
  };
  const actors: Actor[] = [], markers: Marker[] = [];
  const mk = (id: string, x: number, y: number, html: string, cls = "", h = 2.5) => markers.push({ id, x, y, html, cls, h });
  aisles.forEach((a) => { const pct = a.maxStock ? a.stock / a.maxStock : 0, low = pct > 0 && pct < 0.25, blocked = !isFinite(L.dist.E?.[a.id]);
    mk(`a${a.id}`, a.x, a.y, `${blocked ? "⛔ " : ""}${pct <= 0 ? "EMPTY " : low ? "LOW " : ""}L${a.level}<i class="mini"><b style="width:${Math.min(1, pct) * 100}%;background:${pct < 0.25 ? "#ef4444" : "#4ade80"}"></b></i>`, `m3d-tag ${pct <= 0 ? "oos" : low ? "low" : ""}`, 2.7); });
  checkouts.forEach((k) => { const q = customers.filter((c) => c.co === k.id).length, blocked = !isFinite(L.dist.E?.[k.id]);
    mk(`k${k.id}`, k.x, k.y, `${blocked ? "⛔ " : ""}L${k.level} · ${q}/${k.queueCapacity}<i class="mini"><b style="width:${Math.min(1, k.currentCustomerProgress) * 100}%;background:#60a5fa"></b></i>`, `m3d-tag ${q >= k.queueCapacity ? "full" : ""}`, 1.9); });
  mk("door", door.x, door.y, "ENTRANCE", "m3d-door", 1.2);
  const lanes = cashierByLane(s.staff, checkouts);
  Object.entries(lanes).forEach(([lid, c]) => { const k = checkouts.find((z) => z.id === lid)!, serving = customers.some((u) => u.co === lid && u.phase === "CHECKOUT");
    actors.push({ id: `c${c.id}`, kind: "cashier", x: k.x + 0.32, y: k.y + 0.05, seed: strSeed(c.id) }); if (serving) mk(`cs${c.id}`, k.x + 0.32, k.y + 0.05, "SERVE", "m3d-bubble", 2.3); });
  crew.forEach((w) => { actors.push({ id: w.id, kind: w.role, x: w.x, y: w.y, seed: strSeed(w.id) }); if (w.task?.startsWith("work:")) mk(`w${w.id}`, w.x, w.y, "STOCK", "m3d-bubble", 2.3); });
  let bubbles = 0;
  customers.slice(0, 90).forEach((c) => { const def = CUSTOMERS[c.kind] ?? CUSTOMERS.normal, angry = c.mood === "😡", cart = c.phase !== "ENTERING" && c.phase !== "LEAVING" && c.id % 2 === 0;
    actors.push({ id: `u${c.id}`, kind: "customer", x: c.x, y: c.y, cart, angry, thief: c.mood === "🦹", scale: def.scale, seed: c.id });
    const txt = c.say ?? (c.phase === "CHECKOUT" ? "PAY" : c.phase === "SHOPPING" && c.dwell > 0 ? "PICK" : angry ? "😡" : c.mood === "💚" && c.phase === "LEAVING" ? "💚" : "");
    if (txt && bubbles < 24) { bubbles++; mk(`ub${c.id}`, c.x, c.y, txt, c.say ? "m3d-bubble m3d-warn" : "m3d-bubble", 2.2); } });
  const floats3d: Float3D[] = floats.map((f) => ({ id: f.id, x: f.x ?? 2, y: f.y ?? rows - 2, amt: f.txt ?? "+" + formatMoney(f.amt), age: f.age }));
  return (<div className="storewrap"><Store3DScene cols={cols} rows={rows} tier={tier} name={TIERS[tier].name} aisles={aisles} checkouts={checkouts} restockers={restockers} decors={decors} cleanliness={cleanliness}
    actors={actors} markers={markers} floats={floats3d} selected={sel && "id" in sel ? { kind: sel.kind, id: sel.id } : null} buildMode={sel?.mode === "new" || sel?.mode === "move"} onTile={click} /></div>);
}

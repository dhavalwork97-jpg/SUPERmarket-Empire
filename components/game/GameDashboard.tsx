"use client";
import { useEffect } from "react";
import { useGame } from "@/store/store";
import { useGameLoop } from "@/hooks/useGameLoop";
import ExpansionCard from "./ExpansionCard";
import SupplyPanel from "./SupplyPanel";
import StaffPanel from "./StaffPanel";
import GoalsPanel from "./GoalsPanel";
import ObjectivePanel from "./ObjectivePanel";
import AlertsPanel from "./AlertsPanel";
import FxLayer from "./FxLayer";
import { storeStatus, placeCost } from "@/lib/simulation";
import { AISLE_DEFS, AISLE_ORDER, TIERS } from "@/lib/constants";
import { formatMoney } from "@/lib/formatting";
import type { AisleType, ItemKind } from "@/types/game";
import { logo } from "@/lib/assets";
import StoreView from "./StoreView"; import AisleCard from "./AisleCard"; import CheckoutCard from "./CheckoutCard"; import RestockerCard from "./RestockerCard"; import OfflineEarningsModal from "./OfflineEarningsModal";
import { Hud, ObjectiveChip, ActionBar } from "./Hud"; import Sheet from "./Sheet"; import ContextCard from "./ContextCard";
import { useUI } from "@/store/ui";
const DEBUG = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEBUG === "1";
const TITLES = { build: "Build & upgrade", staff: "Staff", supply: "Supply", goals: "Goals" } as const;
function Status() {
  const s = useGame(); const { meters, bottleneck } = storeStatus(s);
  const rows: [string, number][] = [["Customer Demand", meters.demand], ["Checkout Load", meters.checkout], ["Inventory", meters.inventory], ["Restock Coverage", meters.restocking]];
  return (<div className="card span2"><h3><span>STORE STATUS</span><span className={bottleneck === "NORMAL" ? "ok" : "oos"}>{bottleneck}</span></h3>
    <div className="meters">{rows.map(([n, v]) => <div key={n}><div className="lbl">{n} {Math.round(v * 100)}%</div><div className="bar"><i style={{ width: `${v * 100}%`, background: "#a855f7" }} /></div></div>)}</div></div>);
}
/** Build menu: what you can place. Placing happens by tapping the world (see ContextCard). */
function BuildMenu() {
  const s = useGame(), select = useUI((u) => u.select);
  const items: { label: string; kind: ItemKind; type?: AisleType }[] = [...AISLE_ORDER.slice(0, TIERS[s.tier].aisles).map((t) => ({ label: AISLE_DEFS[t].name, kind: "aisle" as const, type: t })), { label: "Checkout", kind: "checkout" as const }, { label: "Restocker", kind: "restocker" as const }, { label: "Decor", kind: "decor" as const }];
  return (<div className="placegrid">{items.map((b) => { const c = placeCost(s, b.kind, b.type); return <button key={b.label} className="btn place" disabled={s.cash < c} onClick={() => select({ mode: "new", kind: b.kind, type: b.type })}>{b.label}<em>{formatMoney(c)}</em></button>; })}</div>);
}
export default function GameDashboard() {
  const ready = useGame((s) => s.isInitialized), load = useGame((s) => s.loadGame), dbg = useGame((s) => s.debug), setSpeed = useGame((s) => s.setSpeed);
  const { sheet, open } = useUI();
  useEffect(() => { load(); }, [load]);
  useGameLoop();
  const a = useGame((s) => s.aisles.map((x) => x.id).join(","));
  const c = useGame((s) => s.checkouts.map((x) => x.id).join(","));
  const r = useGame((s) => s.restockers.map((x) => x.id).join(","));
  const vis = { a: a.split(","), c: c.split(","), r: r.split(",").filter(Boolean) };
  if (!ready) return <div className="center loading"><img src={logo} alt="" width={120} /><p>Loading…</p></div>;
  return (<main className="game"><Hud /><FxLayer />
    <div className="world"><StoreView /><ObjectiveChip /><ContextCard /></div>
    <ActionBar />
    {sheet && <Sheet title={TITLES[sheet]} onClose={() => open(null)}>
      {sheet === "build" && <><BuildMenu /><section className="grid"><Status /><ExpansionCard />{vis.a.map((id) => <AisleCard key={id} id={id} />)}{vis.c.map((id) => <CheckoutCard key={id} id={id} />)}{vis.r.map((id) => <RestockerCard key={id} id={id} />)}</section></>}
      {sheet === "staff" && <StaffPanel />}{sheet === "supply" && <SupplyPanel />}{sheet === "goals" && <><ObjectivePanel go={(t) => open(t)} /><GoalsPanel /></>}
    </Sheet>}
    {DEBUG && <details className="card dbg"><summary>🐞</summary>{[["10k", "+$10K"], ["1m", "+$1M"], ["xp", "+500 XP"], ["spawn", "Spawn"], ["fill", "Fill"], ["empty", "Empty"], ["offline", "Offline 1h"]].map(([c, l]) => <button key={c} className="small" onClick={() => dbg(c)}>{l}</button>)}
      {[1, 2, 5].map((n) => <button key={n} className="small" onClick={() => setSpeed(n)}>{n}x</button>)}</details>}
    <OfflineEarningsModal /></main>);
}

"use client";
import { useEffect, useState } from "react";
import { useGame } from "@/store/store";
import { useGameLoop } from "@/hooks/useGameLoop";
import ExpansionCard from "./ExpansionCard";
import SupplyPanel from "./SupplyPanel";
import StaffPanel from "./StaffPanel";
import GoalsPanel from "./GoalsPanel";
import ObjectivePanel from "./ObjectivePanel";
import AlertsPanel from "./AlertsPanel";
import FxLayer from "./FxLayer";
import { storeStatus } from "@/lib/simulation";
import { logo } from "@/lib/assets";
import TopBar from "./TopBar"; import StoreView from "./StoreView"; import AisleCard from "./AisleCard"; import CheckoutCard from "./CheckoutCard"; import RestockerCard from "./RestockerCard"; import OfflineEarningsModal from "./OfflineEarningsModal";
const DEBUG = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEBUG === "1";
type Tab = "build" | "staff" | "supply" | "goals";
const TABS: [Tab, string][] = [["build", "Upgrades"], ["staff", "Staff"], ["supply", "Supply"], ["goals", "Goals"]];
function Status() {
  const s = useGame(); const { meters, bottleneck } = storeStatus(s);
  const rows: [string, number][] = [["Customer Demand", meters.demand], ["Checkout Load", meters.checkout], ["Inventory", meters.inventory], ["Restock Coverage", meters.restocking]];
  return (<div className="card span2"><h3><span>STORE STATUS</span><span className={bottleneck === "NORMAL" ? "ok" : "oos"}>{bottleneck}</span></h3>
    <div className="meters">{rows.map(([n, v]) => <div key={n}><div className="lbl">{n} {Math.round(v * 100)}%</div><div className="bar"><i style={{ width: `${v * 100}%`, background: "#a855f7" }} /></div></div>)}</div></div>);
}
export default function GameDashboard() {
  const ready = useGame((s) => s.isInitialized), load = useGame((s) => s.loadGame), dbg = useGame((s) => s.debug), setSpeed = useGame((s) => s.setSpeed);
  const [tab, setTab] = useState<Tab>("build");
  useEffect(() => { load(); }, [load]);
  useGameLoop();
  const a = useGame((s) => s.aisles.map((x) => x.id).join(","));
  const c = useGame((s) => s.checkouts.map((x) => x.id).join(","));
  const r = useGame((s) => s.restockers.map((x) => x.id).join(","));
  const vis = { a: a.split(","), c: c.split(","), r: r.split(",").filter(Boolean) };
  if (!ready) return <div className="center loading"><img src={logo} alt="" width={120} /><p>Loading…</p></div>;
  return (<main><TopBar /><FxLayer />
    <div className="layout"><div className="left"><StoreView /></div>
    <div className="right"><ObjectivePanel go={setTab} /><AlertsPanel go={setTab} />
      <nav className="tabs" role="tablist">{TABS.map(([t, l]) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{l}</button>)}</nav>
      {tab === "build" && <section className="grid"><Status /><ExpansionCard />{vis.a.map((id) => <AisleCard key={id} id={id} />)}
        {vis.c.map((id) => <CheckoutCard key={id} id={id} />)}{vis.r.map((id) => <RestockerCard key={id} id={id} />)}</section>}
      {tab === "staff" && <StaffPanel />}
      {tab === "supply" && <SupplyPanel />}
      {tab === "goals" && <GoalsPanel />}</div></div>
    {DEBUG && <div className="card dbg">{[["10k", "+$10K"], ["1m", "+$1M"], ["xp", "+500 XP"], ["spawn", "Spawn"], ["fill", "Fill"], ["empty", "Empty"], ["offline", "Offline 1h"]].map(([c, l]) => <button key={c} className="small" onClick={() => dbg(c)}>{l}</button>)}
      {[1, 2, 5].map((n) => <button key={n} className="small" onClick={() => setSpeed(n)}>{n}x</button>)}</div>}
    <OfflineEarningsModal /></main>);
}

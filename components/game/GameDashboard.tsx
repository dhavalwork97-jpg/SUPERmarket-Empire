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
import TopBar from "./TopBar";
import StoreView from "./StoreView";
import AisleCard from "./AisleCard";
import CheckoutCard from "./CheckoutCard";
import RestockerCard from "./RestockerCard";
import OfflineEarningsModal from "./OfflineEarningsModal";
import MobileActionNav, { type GameTab } from "./MobileActionNav";

const DEBUG = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEBUG === "1";

function Status() {
  const s=useGame(); const {meters,bottleneck}=storeStatus(s);
  const rows:[string,number][]=[["Customer Demand",meters.demand],["Checkout Load",meters.checkout],["Inventory",meters.inventory],["Restock Coverage",meters.restocking]];
  return <div className="card span2"><h3><span>STORE STATUS</span><span className={bottleneck==="NORMAL"?"ok":"oos"}>{bottleneck}</span></h3>
    <div className="meters">{rows.map(([n,v])=><div key={n}><div className="lbl">{n} {Math.round(v*100)}%</div><div className="bar"><i style={{width:(v*100)+"%",background:"#a855f7"}}/></div></div>)}</div>
  </div>;
}

export default function GameDashboard() {
  const ready=useGame(s=>s.isInitialized), load=useGame(s=>s.loadGame), dbg=useGame(s=>s.debug), setSpeed=useGame(s=>s.setSpeed);
  const [tab,setTab]=useState<GameTab>("build"); const [mobileOpen,setMobileOpen]=useState(false);
  useEffect(()=>{load();},[load]); useGameLoop();
  const a=useGame(s=>s.aisles.map(x=>x.id).join(",")), c=useGame(s=>s.checkouts.map(x=>x.id).join(",")), r=useGame(s=>s.restockers.map(x=>x.id).join(","));
  const vis={a:a.split(","),c:c.split(","),r:r.split(",").filter(Boolean)};
  const selectMobileTab=(next:GameTab)=>{if(mobileOpen&&tab===next)setMobileOpen(false);else{setTab(next);setMobileOpen(true);}};
  if(!ready)return <div className="center loading"><img src={logo} alt="" width={120}/><p>Loading…</p></div>;

  const panel=<>
    {tab==="build"&&<section className="grid"><Status/><ExpansionCard/>
      {vis.a.map(id=><AisleCard key={id} id={id}/>)}{vis.c.map(id=><CheckoutCard key={id} id={id}/>)}{vis.r.map(id=><RestockerCard key={id} id={id}/>)}
    </section>}
    {tab==="staff"&&<StaffPanel/>}{tab==="supply"&&<SupplyPanel/>}{tab==="goals"&&<GoalsPanel/>}
  </>;

  return <main className="game-shell">
    <TopBar/><FxLayer/>
    <div className="mobile-goal"><ObjectivePanel go={setTab}/></div>
    <div className="layout">
      <div className="left"><StoreView/></div>
      <div className="right desktop-panel">
        <ObjectivePanel go={setTab}/><AlertsPanel go={setTab}/>
        <nav className="tabs" role="tablist">
          {([["build","Upgrades"],["staff","Staff"],["supply","Supply"],["goals","Goals"]] as [GameTab,string][]).map(([t,l])=>
            <button key={t} role="tab" aria-selected={tab===t} className={tab===t?"on":""} onClick={()=>setTab(t)}>{l}</button>)}
        </nav>
        {panel}
      </div>
    </div>
    <div className="mobile-sheet" aria-hidden={!mobileOpen}>
      <div className="mobile-sheet-handle"/>
      <div className="mobile-sheet-header">
        <div><span className="mobile-sheet-kicker">MANAGEMENT</span><h2>{tab==="build"?"Build & upgrade":tab==="staff"?"Staff":tab==="supply"?"Supply":"Goals"}</h2></div>
        <button className="mobile-sheet-close" onClick={()=>setMobileOpen(false)} aria-label="Close">×</button>
      </div>
      <div className="mobile-sheet-content">{panel}</div>
    </div>
    <MobileActionNav tab={tab} open={mobileOpen} onSelect={selectMobileTab} onClose={()=>setMobileOpen(false)}/>
    {DEBUG&&<div className="card dbg">{[["10k","+$10K"],["1m","+$1M"],["xp","+500 XP"],["spawn","Spawn"],["fill","Fill"],["empty","Empty"],["offline","Offline 1h"]].map(([c,l])=><button key={c} className="small" onClick={()=>dbg(c)}>{l}</button>)}{[1,2,5].map(n=><button key={n} className="small" onClick={()=>setSpeed(n)}>{n}x</button>)}</div>}
    <OfflineEarningsModal/>
  </main>;
}

"use client";
import { useGame } from "@/store/store";
import { ACHIEVEMENTS, OBJECTIVES } from "@/lib/progress";
import { CUSTOMERS, CUSTOMER_KINDS } from "@/lib/customers";
import { EVENTS } from "@/lib/events";
import { char } from "@/lib/assets";
import { Icon } from "./Asset";
export default function GoalsPanel() {
  const s = useGame();
  return (<div className="stafftab">
    <div className="card"><h3><span>TROPHIES</span><span className="lvl">{s.achievements.length}/{ACHIEVEMENTS.length}</span></h3>
      {ACHIEVEMENTS.map((a) => { const got = s.achievements.includes(a.id); return <div key={a.id} className={`lbl trophy ${got ? "" : "dim"}`}><Icon n={got ? "check" : "wait"} size={14} /> <b>{a.name}</b> · {a.desc}{got ? "" : ` (+${a.xp} XP)`}</div>; })}</div>
    <div className="card"><h3><span>YOUR SHOPPERS</span></h3>
      {CUSTOMER_KINDS.map((k) => <div key={k} className="lbl shopper"><img src={char("shopper")} alt="" style={{ filter: CUSTOMERS[k].filter }} /><span><b>{CUSTOMERS[k].name}</b> · {CUSTOMERS[k].blurb}</span></div>)}</div>
    <div className="card"><h3><span>DAILY EVENTS</span><span className="dim">changes every day</span></h3>
      {Object.values(EVENTS).map((e) => <div key={e.name} className="lbl"><b>{e.name}</b> · {e.blurb}</div>)}</div>
    <div className="card"><h3><span>GOAL LIST</span><span className="lvl">{Math.min(s.objectiveStep, OBJECTIVES.length)}/{OBJECTIVES.length} then endless</span></h3>
      {OBJECTIVES.map((o, i) => <div key={o.id} className={`lbl ${i < s.objectiveStep ? "ok" : i === s.objectiveStep ? "" : "dim"}`}>{i < s.objectiveStep ? "✓" : i === s.objectiveStep ? "▶" : "•"} {o.title}</div>)}</div>
  </div>);
}

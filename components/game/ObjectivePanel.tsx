"use client";
import { useGame } from "@/store/store";
import { objectiveAt } from "@/lib/progress";
import { formatMoney, formatNumber } from "@/lib/formatting";
import { Icon } from "./Asset";
export default function ObjectivePanel({ go }: { go: (t: "build" | "staff" | "supply" | "goals") => void }) {
  const s = useGame(); const o = objectiveAt(s.objectiveStep), nxt = objectiveAt(s.objectiveStep + 1);
  const v = Math.min(o.target, o.value(s)), done = v >= o.target, f = (n: number) => (o.money ? formatMoney(n) : formatNumber(n));
  return (<div className={`card goal ${done ? "done" : ""}`}>
    <h3><span><Icon n="check" size={18} /> CURRENT GOAL</span><span className="lvl">+{formatMoney(o.cash)}{o.xp ? ` · +${o.xp} XP` : ""}</span></h3>
    <div className="gtitle">{o.title}</div>
    <div className="bar"><i style={{ width: `${(v / o.target) * 100}%`, background: done ? "#4ade80" : "#fbbf24" }} /></div>
    <div className="lbl">{f(v)} / {f(o.target)} <span className="dim">· {o.hint}</span></div>
    <div className="row">{done ? <button className="btn" onClick={s.claimObjective}>CLAIM REWARD</button> : o.tab ? <button className="small" onClick={() => go(o.tab!)}>Show me where</button> : null}<span className="lbl dim">Next: {nxt.title}</span></div></div>);
}

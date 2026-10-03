"use client";
import { useGame } from "@/store/store";
import { useUI, Sheet } from "@/store/ui";
import { formatMoney, formatNumber } from "@/lib/formatting";
import { levelInfo, objectiveAt } from "@/lib/progress";
import { storeAlerts } from "@/lib/simulation";
import { Icon } from "./Asset";

/** Top strip: only what matters moment to moment. Everything else lives in the sheets. */
export function Hud() {
  const cash = useGame((s) => s.cash), rev = useGame((s) => s.revPerSec), n = useGame((s) => s.customersInStore), sat = useGame((s) => s.satisfaction), xp = useGame((s) => s.xp);
  const li = levelInfo(xp), face = sat >= 0.6 ? "happy" : "angry";
  return (<header className="hud">
    <div className="hud-cash" title="Cash"><Icon n="coin" size={20} /><b>{formatMoney(cash)}</b></div>
    <div className="hud-lvl" title={`${formatNumber(li.into)}/${formatNumber(li.need)} XP`}><span>Lv {li.level}</span><div className="bar xp"><i style={{ width: `${li.pct * 100}%` }} /></div></div>
    <div className="hud-stats"><span title="Sales per second"><Icon n="dollar" size={14} />{formatMoney(rev)}/s</span><span title="Shoppers in store">👥 {n}</span><span title="Satisfaction"><Icon n={face} size={14} />{Math.round(sat * 100)}%</span></div>
  </header>);
}

/** One current objective as a thin chip (tap = claim when done, else jump to the relevant sheet), plus the single most important alert. */
export function ObjectiveChip() {
  const s = useGame(), open = useUI((u) => u.open), o = objectiveAt(s.objectiveStep);
  const v = Math.min(o.target, o.value(s)), done = v >= o.target, f = (n: number) => (o.money ? formatMoney(n) : formatNumber(n));
  const top = storeAlerts(s)[0];
  return (<div className="chips">
    <button className={`objchip ${done ? "done" : ""}`} onClick={() => (done ? s.claimObjective() : open(o.tab ?? "goals"))} aria-label={`Objective: ${o.title}`}>
      <span className="objtitle">{done ? "✔ Claim reward" : o.title}</span><span className="objprog">{f(v)}/{f(o.target)}</span><div className="bar"><i style={{ width: `${(v / o.target) * 100}%`, background: done ? "#4ade80" : "#fbbf24" }} /></div></button>
    {top && <button className={`alertchip ${top.tone}`} onClick={() => open(top.id[0] === "o" || top.id[0] === "l" ? "supply" : top.id === "dirty" ? "staff" : "build")}><Icon n={top.icon} size={14} /><span>{top.text}</span></button>}
  </div>);
}

const TABS: [Sheet, string, string][] = [["build", "🔨", "Build"], ["staff", "🧑‍💼", "Staff"], ["supply", "📦", "Supply"], ["goals", "🎯", "Goals"]];
export function ActionBar() {
  const { sheet, open } = useUI();
  return (<nav className="actionbar" aria-label="Management">{TABS.map(([t, e, l]) => <button key={t} className={sheet === t ? "on" : ""} aria-pressed={sheet === t} onClick={() => open(sheet === t ? null : t)}><span aria-hidden>{e}</span>{l}</button>)}</nav>);
}

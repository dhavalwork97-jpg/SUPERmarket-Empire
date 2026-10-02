"use client";
import { useGame } from "@/store/store";
import { formatMoney, formatNumber } from "@/lib/formatting";
import { levelInfo } from "@/lib/progress";
import { EVENTS, dayOf } from "@/lib/events";
import { TIERS } from "@/lib/constants";
import { logo } from "@/lib/assets";
import { Icon } from "./Asset";
export default function TopBar() {
  const cash = useGame((s) => s.cash), eps = useGame((s) => s.earningsPerSecond), rev = useGame((s) => s.revPerSec), n = useGame((s) => s.customersInStore), reset = useGame((s) => s.resetGame);
  const xp = useGame((s) => s.xp), tier = useGame((s) => s.tier), sat = useGame((s) => s.satisfaction), ev = useGame((s) => s.event), clock = useGame((s) => s.clock);
  const li = levelInfo(xp), exp = Math.max(0, rev - eps), face = sat >= 0.6 ? "happy" : "angry";
  return (<header className="top">
    <div className="toprow"><img src={logo} alt="SUPERmarket Tycoon" className="logo" /><div className="cash" title="Cash"><Icon n="coin" size={24} /><b>{formatMoney(cash)}</b></div>
      <div className="lvl-box" title={`${formatNumber(xp)} XP total`}><div className="lvlrow"><Icon n="gem" size={18} /><b>Level {li.level}</b><span className="dim">{formatNumber(li.into)}/{formatNumber(li.need)} XP</span></div><div className="bar xp"><i style={{ width: `${li.pct * 100}%` }} /></div></div>
      <button className="small reset" onClick={() => confirm("Reset your supermarket?\n\nAll progress will be permanently lost.") && reset()}>Reset</button></div>
    <div className="stats">
      <span title="Sales per second"><Icon n="dollar" size={16} /> Sales <b>{formatMoney(rev)}/s</b></span>
      <span title="Wages, upkeep and the cost of goods sold"><Icon n="alert" size={16} /> Expenses <b>{formatMoney(exp)}/s</b></span>
      <span title="Sales minus expenses"><Icon n="check" size={16} /> Profit <b className={eps > 0 ? "ok" : "oos"}>{formatMoney(eps)}/s</b></span>
      <span title="Customers in store">👥 <b>{n}</b></span>
      <span title="Customer satisfaction"><Icon n={face} size={16} /> <b>{Math.round(sat * 100)}%</b></span>
      <span className="dim">{TIERS[Math.min(tier, TIERS.length - 1)].name} · Day {dayOf(clock)}</span>
    </div>
    {ev && EVENTS[ev.id] && <div className="event"><Icon n="speed" size={16} /> <b>{EVENTS[ev.id].name}</b> {EVENTS[ev.id].blurb}</div>}
  </header>);
}

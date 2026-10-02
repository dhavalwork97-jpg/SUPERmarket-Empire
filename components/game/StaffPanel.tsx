"use client";
import { useGame } from "@/store/store";
import { STAFF_DEFS, STAFF_ROLES, canHire, hireCost, wagePerSecond } from "@/lib/staff";
import { levelOf } from "@/lib/progress";
import { TIERS } from "@/lib/constants";
import { formatMoney } from "@/lib/formatting";
import { char } from "@/lib/assets";
import { Icon } from "./Asset";
import UpgradeButton from "./UpgradeButton";
const SPRITE = { cashier: "cashier", cleaner: "cleaner", security: "guard", manager: "manager" } as const;
export default function StaffPanel() {
  const s = useGame(); const lvl = levelOf(s.xp), cap = TIERS[s.tier].staff, lanes = s.checkouts.filter((c) => c.level > 0).length;
  return (<div className="stafftab">
    <div className="card"><h3><span>EMPLOYEES {s.staff.length}/{cap}</span><span className="lvl">Payroll {formatMoney(wagePerSecond(s.staff, s.restockers, s.tier))}/s</span></h3>
      <div className="lbl dim">Wages and store upkeep are paid every second. Restockers are hired from the build bar. Expanding the store adds staff slots.</div></div>
    {STAFF_ROLES.map((r) => { const d = STAFF_DEFS[r], mine = s.staff.filter((x) => x.role === r), ok = canHire(r, s.staff, s.tier, lanes, lvl), cost = hireCost(r, mine.length);
      return (<div key={r} className="card staffcard"><div className="srow"><img src={char(SPRITE[r])} alt="" className="sthumb" draggable={false} /><div className="grow"><h3><span>{d.name.toUpperCase()}</span><span className="lvl">{mine.length}/{d.max(s.tier, lanes)}</span></h3><div className="lbl dim">{d.job}</div></div></div>
        {mine.map((m) => <div key={m.id} className="member"><div className="lbl"><b>Level {m.level}</b> · {d.effect(m.efficiency)} · wage {formatMoney(m.salary)}/s</div>
          <div className="lbl dim">Workload {Math.round(m.workload * 100)}%</div><div className="bar"><i style={{ width: `${m.workload * 100}%`, background: m.workload > 0.85 ? "#f87171" : "#38bdf8" }} /></div>
          <UpgradeButton cost={m.upgradeCost} cash={s.cash} onClick={() => s.upgradeStaff(m.id)} label="TRAIN" /></div>)}
        {ok.ok ? <UpgradeButton cost={cost} cash={s.cash} onClick={() => s.hireStaff(r)} label="HIRE" /> : mine.length < d.max(s.tier, lanes) || !ok.ok ? <div className="lbl dim"><Icon n="wait" size={14} /> {ok.why}</div> : null}</div>); })}
    {s.restockers.filter((r) => r.level > 0).length > 0 && <div className="card"><h3><span>RESTOCKERS</span><span className="lvl">{s.restockers.filter((r) => r.level > 0).length} working</span></h3>
      {s.restockers.filter((r) => r.level > 0).map((r) => <div key={r.id} className="lbl">#{r.id.slice(1)} · Level {r.level} · workload {Math.round((r.workload ?? 0) * 100)}% · wage {formatMoney(r.salary ?? 0)}/s <span className="dim">(upgrade in the Upgrades tab)</span></div>)}</div>}
  </div>);
}

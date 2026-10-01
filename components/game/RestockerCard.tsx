"use client";
import { useGame } from "@/store/store";
import { AISLE_DEFS } from "@/lib/constants";
import UpgradeButton from "./UpgradeButton";
export default function RestockerCard({ id }: { id: string }) {
  const r = useGame((s) => s.restockers.find((x) => x.id === id))!; const aisles = useGame((s) => s.aisles);
  const cash = useGame((s) => s.cash), up = useGame((s) => s.upgradeRestocker), assign = useGame((s) => s.assignRestocker); const locked = r.level === 0;
  const a = aisles.find((x) => x.id === r.assignedAisleId); const full = !a || a.stock >= a.maxStock;
  return (<div className="card"><h3>📦 RESTOCKER #{id.slice(1)} <span className="lvl">{locked ? "Not hired" : `Level ${r.level}`}</span></h3>
    {!locked && <><div className="lbl">Assigned: <select value={r.assignedAisleId ?? ""} onChange={(e) => assign(id, e.target.value)}>{aisles.filter((x) => x.level > 0).map((x) => <option key={x.id} value={x.id}>{AISLE_DEFS[x.type].name}</option>)}</select></div>
    <div className="lbl">{full ? "Waiting for demand" : `Next restock: ${r.currentCooldown.toFixed(1)}s`} · +{r.restockAmount}</div>
    <div className="bar"><i style={{ width: `${full ? 100 : (1 - r.currentCooldown / r.cooldown) * 100}%`, background: "#f59e0b" }} /></div></>}
    <UpgradeButton cost={r.upgradeCost} cash={cash} onClick={() => up(id)} label={locked ? "HIRE" : "UPGRADE"} /></div>);
}

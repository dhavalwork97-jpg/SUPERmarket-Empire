"use client";
import { useGame } from "@/store/store";
import { AISLE_DEFS } from "@/lib/constants";
import { getAisleRevenue, getAisleMaxStock } from "@/lib/economy";
import { formatMoney, formatNumber } from "@/lib/formatting";
import UpgradeButton from "./UpgradeButton";
export default function AisleCard({ id }: { id: string }) {
  const a = useGame((s) => s.aisles.find((x) => x.id === id))!; const cash = useGame((s) => s.cash); const up = useGame((s) => s.upgradeAisle);
  const d = AISLE_DEFS[a.type], pct = a.maxStock ? (a.stock / a.maxStock) * 100 : 0, locked = a.level === 0;
  return (<div className="card"><h3>{d.emoji} {d.name.toUpperCase()} #{a.id.slice(1)} <span className="lvl">{locked ? "Not built" : `Level ${a.level}`}</span></h3>
    {!locked && <><div className="lbl">Stock {Math.floor(a.stock)}/{a.maxStock} {a.stock <= 0 && <b className="oos">OUT OF STOCK</b>}</div>
    <div className="bar"><i style={{ width: `${pct}%`, background: pct < 25 ? "#ef4444" : "#22c55e" }} /></div>
    <div className="lbl">Revenue / customer: {formatMoney(getAisleRevenue(a.baseRevenue, a.level))}</div></>}
    <div className="lbl dim">Next: +{formatMoney(getAisleRevenue(a.baseRevenue, a.level + 1) - (locked ? 0 : getAisleRevenue(a.baseRevenue, a.level)))} revenue, {formatNumber(getAisleMaxStock(d.stock, a.level + 1) - (locked ? 0 : a.maxStock))} max stock</div>
    <UpgradeButton cost={a.upgradeCost} cash={cash} onClick={() => up(id)} label={locked ? "BUILD" : "UPGRADE"} /></div>);
}

"use client";
import { useGame } from "@/store/store";
import { TIERS } from "@/lib/constants";
import { levelOf } from "@/lib/progress";
import { formatMoney } from "@/lib/formatting";
import UpgradeButton from "./UpgradeButton";
export default function ExpansionCard() {
  const tier = useGame((s) => s.tier), cash = useGame((s) => s.cash), expand = useGame((s) => s.expandStore), xp = useGame((s) => s.xp);
  const cur = TIERS[tier], next = TIERS[tier + 1], lvl = levelOf(xp);
  return (<div className="card span2 expand"><div className="storefront"><img src={cur.img} alt={cur.name} /></div>
    <div className="grow"><h3>{cur.name.toUpperCase()}</h3>
      <div className="path">{TIERS.map((t, i) => <span key={t.name} className={i === tier ? "here" : i < tier ? "past" : ""}>{t.name}</span>)}</div>
      <div className="lbl">Demand ×{cur.demand} · {cur.cols}×{cur.rows} floor · {cur.aisles} aisle types · {cur.staff} staff slots · upkeep {formatMoney(cur.upkeep)}/s</div>
      {next ? <><div className="lbl dim">Next: {next.name}: {next.cols}×{next.rows} floor, {next.aisles} aisle types, {next.staff} staff slots, demand ×{next.demand}, upkeep {formatMoney(next.upkeep)}/s. Needs level {next.level}.</div>
        <UpgradeButton cost={next.cost} cash={cash} onClick={expand} label={`EXPAND TO ${next.name.toUpperCase()}`} blocked={lvl < next.level ? `REACH LEVEL ${next.level} (you are ${lvl})` : undefined} /></> : <div className="lbl ok">Maximum size reached</div>}</div></div>);
}

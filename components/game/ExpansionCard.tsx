"use client";
import { useGame } from "@/store/store";
import { TIERS } from "@/lib/constants";
import UpgradeButton from "./UpgradeButton";
export default function ExpansionCard() {
  const tier = useGame((s) => s.tier), cash = useGame((s) => s.cash), expand = useGame((s) => s.expandStore);
  const cur = TIERS[tier], next = TIERS[tier + 1];
  return (<div className="card span2 expand"><div className="storefront"><span>{cur.emoji}</span><img src={cur.img} alt="" onError={(e) => (e.currentTarget.style.display = "none")} /></div>
    <div className="grow"><h3>{cur.name.toUpperCase()}</h3><div className="lbl">Customer demand ×{cur.demand}</div>
      {next ? <><div className="lbl dim">Next: {next.name}: bigger {next.cols}×{next.rows} floor, {next.aisles} shelf types, demand ×{next.demand}</div>
        <UpgradeButton cost={next.cost} cash={cash} onClick={expand} label={`EXPAND TO ${next.name.toUpperCase()}`} /></> : <div className="lbl ok">Maximum size reached</div>}</div></div>);
}

"use client";
import { useGame } from "@/store/store";
import { CHECKOUT } from "@/lib/constants";
import { getCheckoutProcessingTime } from "@/lib/economy";
import UpgradeButton from "./UpgradeButton";
export default function CheckoutCard({ id }: { id: string }) {
  const c = useGame((s) => s.checkouts.find((x) => x.id === id))!; const cash = useGame((s) => s.cash); const up = useGame((s) => s.upgradeCheckout);
  const q = useGame((s) => s.customers.filter((u) => u.co === id).length); const locked = c.level === 0;
  return (<div className="card"><h3>🛒 CHECKOUT #{id.slice(1)} <span className="lvl">{locked ? "Not built" : `Level ${c.level}`}</span></h3>
    {!locked && <><div className="lbl">Processing: {c.processingTime.toFixed(1)}s · Queue {q}/{c.queueCapacity}</div>
    <div className="bar"><i style={{ width: `${c.currentCustomerProgress * 100}%`, background: "#3b82f6" }} /></div></>}
    <div className="lbl dim">Next: {getCheckoutProcessingTime(CHECKOUT.time, c.level + 1).toFixed(1)}s, +1 queue capacity</div>
    <UpgradeButton cost={c.upgradeCost} cash={cash} onClick={() => up(id)} label={locked ? "BUILD" : "UPGRADE"} /></div>);
}

"use client";
import { formatMoney } from "@/lib/formatting";
import { Icon } from "./Asset";
export default function UpgradeButton({ cost, cash, onClick, label = "UPGRADE", blocked }: { cost: number; cash: number; onClick: () => void; label?: string; blocked?: string }) {
  const ok = cash >= cost && !blocked;
  return (<button className={`btn ${ok ? "" : "locked"}`} disabled={!ok} onClick={onClick}>{blocked ? `🔒 ${blocked}` : ok ? <><Icon n="upgrade" size={18} /> {label} · {formatMoney(cost)}</> : <><Icon n="coin" size={16} /> {formatMoney(cost)} · NEED MORE CASH</>}</button>);
}

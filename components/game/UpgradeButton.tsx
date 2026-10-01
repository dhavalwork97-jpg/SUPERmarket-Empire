"use client";
import { formatMoney } from "@/lib/formatting";
export default function UpgradeButton({ cost, cash, onClick, label = "UPGRADE" }: { cost: number; cash: number; onClick: () => void; label?: string }) {
  const ok = cash >= cost;
  return (<button className={`btn ${ok ? "" : "locked"}`} disabled={!ok} onClick={onClick}>{ok ? `${label} · ${formatMoney(cost)}` : `🔒 ${formatMoney(cost)} · INSUFFICIENT FUNDS`}</button>);
}

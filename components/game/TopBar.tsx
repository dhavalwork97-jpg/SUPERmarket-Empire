"use client";
import { useGame } from "@/store/store";
import { formatMoney } from "@/lib/formatting";
export default function TopBar() {
  const cash = useGame((s) => s.cash), eps = useGame((s) => s.earningsPerSecond), n = useGame((s) => s.customersInStore), reset = useGame((s) => s.resetGame);
  return (<header className="top"><b>🏪 SUPERmarket Tycoon</b><span>💰 {formatMoney(cash)}</span><span>📈 {formatMoney(eps)}/s</span><span>👥 {n}</span>
    <button className="small" onClick={() => confirm("Reset your supermarket?\n\nAll progress will be permanently lost.") && reset()}>Reset Save</button></header>);
}

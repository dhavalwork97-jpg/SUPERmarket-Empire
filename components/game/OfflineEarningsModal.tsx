"use client";
import { useGame } from "@/store/store";
import { formatDuration, formatMoney } from "@/lib/formatting";
export default function OfflineEarningsModal() {
  const o = useGame((s) => s.offline), collect = useGame((s) => s.collectOffline);
  if (!o) return null;
  return (<div className="modal"><div className="card center"><h2>WELCOME BACK!</h2><p>While you were away...</p><p>⏱ {formatDuration(o.seconds)}</p><p className="big">💰 {formatMoney(o.earnings)}</p><button className="btn" onClick={collect}>COLLECT</button></div></div>);
}

"use client";
import { useGame } from "@/store/store";
import { storeAlerts } from "@/lib/simulation";
import { Icon } from "./Asset";
export default function AlertsPanel({ go }: { go: (t: "build" | "staff" | "supply" | "goals") => void }) {
  const s = useGame(); const al = storeAlerts(s);
  return (<div className="card"><h3><span>NEEDS ATTENTION</span><span className={al.length ? "oos" : "ok"}>{al.length || "All good"}</span></h3>
    {al.length === 0 ? <div className="lbl ok"><Icon n="check" size={16} /> Shelves stocked, queues moving.</div> :
      al.slice(0, 4).map((a) => <div key={a.id} className={`alert ${a.tone}`}><Icon n={a.icon} size={16} /><span>{a.text}</span>{(a.id[0] === "o" || a.id[0] === "l") && <button className="small" onClick={() => go("supply")}>Supply</button>}{a.id === "dirty" && <button className="small" onClick={() => go("staff")}>Staff</button>}</div>)}
    {al.length > 4 && <div className="lbl dim">+{al.length - 4} more</div>}</div>);
}

"use client";
import { useGame } from "@/store/store";
import { fxImg } from "@/lib/assets";
import { Icon } from "./Asset";
const ICON: Record<string, "alert" | "restock" | "angry" | "check" | "upgrade" | "gem" | "speed" | "coin" | "happy"> = { low: "restock", oos: "alert", theft: "angry", stopped: "check", event: "speed", achieve: "gem", built: "upgrade", mission: "coin", toast: "check", level: "gem", xp: "gem", expand: "upgrade" };
/** Lightweight, self-expiring banners driven by the simulation's `fx` list (no timers of its own). */
export default function FxLayer() {
  const fx = useGame((s) => s.fx).slice(-4);
  return (<div className="fxlayer" aria-live="polite">{fx.map((f) => <div key={f.id} className={`fxitem ${f.kind}`} style={{ opacity: Math.min(1, 3.4 - f.age) }}>
    {(f.kind === "level" || f.kind === "expand") && <img src={fxImg(f.kind === "level" ? "levelup-sparkle" : "confetti")} alt="" className="fxbig" draggable={false} />}
    <Icon n={ICON[f.kind] ?? "check"} size={20} /><span>{f.text}</span></div>)}</div>);
}

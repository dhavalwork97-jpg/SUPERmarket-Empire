"use client";
import { ReactNode, useEffect } from "react";
/** Bottom sheet on phones, side drawer on desktop. The world stays visible and tappable above/beside it. */
export default function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (<section className="sheet" role="dialog" aria-label={title}>
    <button className="sheet-grab" aria-label="Close" onClick={onClose}><i /></button>
    <div className="sheet-head"><h2>{title}</h2><button className="sheet-x" onClick={onClose} aria-label="Close panel">✕</button></div>
    <div className="sheet-body">{children}</div></section>);
}

"use client";
import { useEffect } from "react";
import { useGame } from "@/store/store";
import { TICK } from "@/lib/constants";
export function useGameLoop() {
  const ready = useGame((s) => s.isInitialized);
  useEffect(() => {
    if (!ready) return;
    let raf = 0, last = performance.now(), acc = 0;
    const frame = (now: number) => {
      const d = Math.min(0.25, Math.max(0, (now - last) / 1000)); last = now; acc += d;
      let n = 0; const { simulateTick, speed } = useGame.getState();
      while (acc >= TICK && n++ < 5) { simulateTick(TICK * speed); acc -= TICK; }
      if (n >= 5) acc = 0;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const save = () => useGame.getState().saveGame();
    const vis = () => document.hidden && save();
    const iv = setInterval(save, 15000);
    document.addEventListener("visibilitychange", vis); window.addEventListener("beforeunload", save);
    return () => { cancelAnimationFrame(raf); clearInterval(iv); document.removeEventListener("visibilitychange", vis); window.removeEventListener("beforeunload", save); };
  }, [ready]);
}

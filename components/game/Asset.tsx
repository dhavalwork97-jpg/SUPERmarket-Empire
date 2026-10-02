"use client";
import { useState } from "react";
import { icon, IconName, decorSprite, decorEmoji } from "@/lib/assets";
export function Icon({ n, size = 18, className = "" }: { n: IconName; size?: number; className?: string }) {
  return <img src={icon(n)} alt="" width={size} height={size} className={`ico ${className}`} draggable={false} style={{ width: size, height: size }} />;
}
/** Decor sprite that falls back to its emoji if the WebP has not been generated yet (run `npm run assets`). */
export function DecorImg({ id, className = "spr" }: { id?: string; className?: string }) {
  const [bad, setBad] = useState(false);
  return bad ? <span className="emo">{decorEmoji(id)}</span> : <img src={decorSprite(id)} alt="" className={className} draggable={false} onError={() => setBad(true)} />;
}
export function Img({ src, alt = "", className = "", style }: { src: string; alt?: string; className?: string; style?: React.CSSProperties }) {
  return <img src={src} alt={alt} className={className} style={style} draggable={false} loading="lazy" decoding="async" />;
}

"use client";
import { icon, IconName } from "@/lib/assets";
export function Icon({ n, size = 18, className = "" }: { n: IconName; size?: number; className?: string }) {
  return <img src={icon(n)} alt="" width={size} height={size} className={`ico ${className}`} draggable={false} style={{ width: size, height: size }} />;
}
export function Img({ src, alt = "", className = "", style }: { src: string; alt?: string; className?: string; style?: React.CSSProperties }) {
  return <img src={src} alt={alt} className={className} style={style} draggable={false} loading="lazy" decoding="async" />;
}

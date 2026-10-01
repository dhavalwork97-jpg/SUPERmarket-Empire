const S = ["", "K", "M", "B", "T", "Qa", "Qi"];
export function formatNumber(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "0";
  if (v < 1000) return String(parseFloat(v.toPrecision(3)));
  const i = Math.min(S.length - 1, Math.floor(Math.log10(v) / 3));
  return parseFloat((v / Math.pow(1000, i)).toPrecision(3)) + S[i];
}
export const formatMoney = (v: number) => "$" + (v < 100 && v > 0 ? v.toFixed(2) : formatNumber(v));
export const formatDuration = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : m ? `${m}m ${Math.floor(s % 60)}s` : `${Math.floor(s)}s`; };

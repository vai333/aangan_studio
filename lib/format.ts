// Small, dependency-free formatters. Indian grouping (1,00,000) and IST throughout.
export const IST = "Asia/Kolkata";

export const fmtSqft = (n: number) => `${n.toLocaleString("en-IN")} sq ft`;

export function inr(n: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact) {
    if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(n >= 1e8 ? 0 : 1)} Cr`;
    if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(n >= 1e6 ? 0 : 1)} L`;
    if (Math.abs(n) >= 1e3) return `₹${(n / 1e3).toFixed(1)}k`;
  }
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: n < 10 ? 2 : 0 })}`;
}

export const pct = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`;

export function monthLabel(fromIso: string, weeks: number): string {
  const d = new Date(new Date(fromIso).getTime() + weeks * 7 * 864e5);
  return d.toLocaleString("en-IN", { month: "short", timeZone: IST });
}

export function istHour(iso: string): number {
  return Number(new Date(iso).toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: IST }));
}

export function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { timeZone: IST, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function fmtDuration(sec: number): string {
  if (sec >= 86400) return `${Math.round(sec / 86400)} d`;
  if (sec >= 3600) { const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return m ? `${h}h ${m}m` : `${h}h`; }
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return s ? `${m}m ${s}s` : `${m}m`;
}

export function fmtAgo(iso: string, nowMs: number): string {
  const mins = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

export function maskPhone(p: string): string {
  const d = p.replace(/\D/g, "");
  return d.length >= 10 ? `+${d.slice(0, d.length - 10)} ${d.slice(-10, -8)}••• ••${d.slice(-3)}` : "•••";
}

/** Front desk hours in the brief: 10am–7pm. */
export const isAfterHours = (iso: string) => {
  const h = istHour(iso);
  return h < 10 || h >= 19;
};

/** "₹26–46 L" / "₹1.2–2.1 Cr" — a range in one unit. */
export function inrRange(lo: number, hi: number): string {
  if (hi >= 1e7) return `₹${(lo / 1e7).toFixed(1)}–${(hi / 1e7).toFixed(1)} Cr`;
  if (hi >= 1e5) return `₹${Math.round(lo / 1e5)}–${Math.round(hi / 1e5)} L`;
  return `${inr(lo)}–${inr(hi)}`;
}

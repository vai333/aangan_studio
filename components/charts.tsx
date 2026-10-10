"use client";
// Hand-built SVG charts: thin marks, 2px surface gaps, hairline grid,
// hover tooltips on every mark, text in ink tokens (never series colour).
import { useState } from "react";

function Tip({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs shadow-lg whitespace-nowrap"
      style={{ left: x, top: y - 8 }}>
      {children}
    </div>
  );
}

/* ── Funnel: ordinal stages, one hue light→dark ─────────────────────── */
export function Funnel({ stages }: { stages: { label: string; value: number; note?: string }[] }) {
  const max = Math.max(1, ...stages.map((s) => s.value));
  const ramp = ["#e9a98c", "#d98463", "#c4643f", "#a4492a", "#83361c", "#652914"];
  return (
    <ol className="space-y-2.5">
      {stages.map((s, i) => {
        const prev = i ? stages[i - 1].value : null;
        const conv = prev ? Math.round((s.value / Math.max(1, prev)) * 100) : null;
        return (
          <li key={s.label} className="grid grid-cols-[minmax(0,9.5rem)_1fr_auto] items-center gap-3 text-sm" title={s.note}>
            <span className="truncate text-ink-2">{s.label}</span>
            <span className="relative h-6">
              <span className="absolute inset-y-0 left-0 rounded-r-[4px] transition-[width]" style={{ width: `${Math.max(2, (s.value / max) * 100)}%`, background: ramp[Math.min(i, ramp.length - 1)] }} />
            </span>
            <span className="tnum w-20 text-right">
              <b className="font-semibold">{s.value}</b>
              {conv !== null && <span className="ml-1.5 text-xs text-muted">{conv}%</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ── Segmented bar with legend (decision mix) ──────────────────────── */
export function SegmentBar({ parts, onPick }: { parts: { key: string; label: string; value: number; color: string; href?: string }[]; onPick?: (k: string) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = parts.reduce((t, p) => t + p.value, 0) || 1;
  const visible = parts.filter((p) => p.value > 0);
  return (
    <div>
      <div className="flex h-7 w-full gap-[2px] overflow-hidden rounded-[6px]" role="img" aria-label="Decision mix">
        {visible.map((p) => (
          <a key={p.key} href={p.href} onClick={() => onPick?.(p.key)} onMouseEnter={() => setHover(p.key)} onMouseLeave={() => setHover(null)}
            className="relative h-full transition-opacity" title={`${p.label}: ${p.value}`}
            style={{ width: `${(p.value / total) * 100}%`, background: p.color, opacity: hover && hover !== p.key ? 0.45 : 1 }} />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-5 gap-y-1.5 text-sm">
        {parts.map((p) => (
          <li key={p.key} onMouseEnter={() => setHover(p.key)} onMouseLeave={() => setHover(null)}>
            <a href={p.href} className={`flex items-center gap-2 rounded px-1 -mx-1 ${hover === p.key ? "bg-surface-2" : ""}`}>
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: p.color }} />
              <span className="truncate text-ink-2">{p.label}</span>
              <span className="tnum ml-auto font-semibold">{p.value}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── The courtyard clock: calls by hour of day, front-desk hours shaded ── */
export function ClockDial({ byHour, afterShare, deskFrom = 10, deskTo = 19 }: { byHour: number[]; afterShare: number; deskFrom?: number; deskTo?: number }) {
  const [hover, setHover] = useState<{ h: number; x: number; y: number } | null>(null);
  const size = 240, c = size / 2, r0 = 56, r1 = 104;
  const max = Math.max(1, ...byHour);
  const ang = (h: number) => (h / 24) * Math.PI * 2 - Math.PI / 2;
  const pt = (h: number, r: number) => [c + r * Math.cos(ang(h)), c + r * Math.sin(ang(h))];
  const arc = (from: number, to: number, r: number) => {
    const [x0, y0] = pt(from, r), [x1, y1] = pt(to, r);
    const large = (to - from) / 24 > 0.5 ? 1 : 0;
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
  };
  return (
    <div className="relative mx-auto w-full max-w-[260px]">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full" role="img" aria-label={`Calls by hour. ${Math.round(afterShare * 100)}% outside front-desk hours.`}>
        <circle cx={c} cy={c} r={r1 + 8} fill="var(--surface-2)" />
        {/* night: outside desk hours */}
        <path d={arc(deskTo, deskFrom + 24, r1 + 4)} stroke="color-mix(in oklab, var(--d-incomplete) 22%, transparent)" strokeWidth={14} fill="none" />
        <path d={arc(deskFrom, deskTo, r1 + 4)} stroke="color-mix(in oklab, var(--accent) 18%, transparent)" strokeWidth={14} fill="none" />
        <circle cx={c} cy={c} r={r0 - 6} fill="var(--surface)" stroke="var(--line)" />
        {[0, 6, 12, 18].map((h) => {
          const [x, y] = pt(h, r0 - 16);
          return <text key={h} x={x} y={y + 4} textAnchor="middle" fontSize="10" fill="var(--muted)" className="tnum">{h === 0 ? "12a" : h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`}</text>;
        })}
        {byHour.map((n, h) => {
          const mid = h + 0.5;
          const len = n ? 6 + ((r1 - r0 - 6) * n) / max : 2;
          const [x0, y0] = pt(mid, r0);
          const [x1, y1] = pt(mid, r0 + len);
          const desk = h >= deskFrom && h < deskTo;
          return (
            <g key={h} onMouseEnter={() => { const [hx, hy] = pt(mid, r1); setHover({ h, x: (hx / size) * 100, y: (hy / size) * 100 }); }} onMouseLeave={() => setHover(null)}>
              <line x1={x0} y1={y0} x2={pt(mid, r1)[0]} y2={pt(mid, r1)[1]} stroke="transparent" strokeWidth={14} />
              <line x1={x0} y1={y0} x2={x1} y2={y1} stroke={n ? (desk ? "var(--accent)" : "var(--d-incomplete)") : "var(--line-strong)"} strokeWidth={5} strokeLinecap="round" opacity={hover && hover.h !== h ? 0.4 : 1} />
            </g>
          );
        })}
        <text x={c} y={c - 2} textAnchor="middle" fontSize="26" fontWeight="600" fill="var(--ink)">{Math.round(afterShare * 100)}%</text>
        <text x={c} y={c + 15} textAnchor="middle" fontSize="10" fill="var(--muted)">after hours</text>
      </svg>
      {hover && (
        <div className="pointer-events-none absolute" style={{ left: `${hover.x}%`, top: `${hover.y}%` }}>
          <Tip x={0} y={0}>
            <b>{hover.h}:00–{hover.h + 1}:00</b> · {byHour[hover.h]} call{byHour[hover.h] === 1 ? "" : "s"}
            <span className="block text-muted">{hover.h >= deskFrom && hover.h < deskTo ? "Front-desk hours" : "Desk closed — agent only"}</span>
          </Tip>
        </div>
      )}
      <div className="mt-2 flex justify-center gap-4 text-xs text-ink-2">
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-3 rounded-full bg-accent" />10am–7pm desk</span>
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-3 rounded-full" style={{ background: "var(--d-incomplete)" }} />Desk closed</span>
      </div>
    </div>
  );
}

/* ── Horizontal bar list (single series) ───────────────────────────── */
export function BarList({ rows, unit = "count", color = "var(--d-no)" }: { rows: { label: string; value: number; hint?: string }[]; unit?: "count" | "inr"; color?: string }) {
  const format = (v: number) => (unit === "inr" ? `₹${v.toLocaleString("en-IN", { maximumFractionDigits: v < 10 ? 2 : 0 })}` : String(v));
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r, i) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3 text-sm" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} title={r.hint}>
          <span className="truncate text-ink-2">{r.label}</span>
          <span className="h-[14px] rounded-r-[4px]" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: color, opacity: hover !== null && hover !== i ? 0.45 : 1 }} />
          <span className="tnum font-semibold">{format(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}

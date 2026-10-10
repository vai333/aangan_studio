"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

const DECISIONS = [
  ["", "All decisions"], ["qualified", "Qualified (all)"], ["QUALIFIED", "Qualified"], ["QUALIFIED_WITH_NOTES", "Qualified · notes"],
  ["NURTURE", "Nurture"], ["INCOMPLETE", "Needs callback"], ["ESCALATION", "Escalation"], ["NOT_QUALIFIED", "Not a fit"],
] as const;
const FLAGS = [["vip", "★ VIP"], ["repeat", "↻ Repeat"], ["after", "☾ After hours"], ["price", "₹ Asked price"], ["unacked", "Not picked up"]] as const;

export function CallFilters({ areas }: { areas: string[] }) {
  const sp = useSearchParams();
  const path = usePathname();
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = (k: string, v: string | null) => {
    const n = new URLSearchParams(sp.toString());
    if (v) n.set(k, v); else n.delete(k);
    start(() => router.replace(`${path}?${n.toString()}`, { scroll: false }));
  };
  const flags = new Set((sp.get("f") ?? "").split(",").filter(Boolean));
  const toggle = (f: string) => {
    flags.has(f) ? flags.delete(f) : flags.add(f);
    set("f", [...flags].join(",") || null);
  };
  const sel = "focus-ring h-9 rounded-full border border-line bg-surface px-3 text-sm text-ink";

  return (
    <div className={`flex flex-wrap items-center gap-2 transition-opacity ${pending ? "opacity-60" : ""}`}>
      <input type="search" placeholder="Search name, area, transcript…" defaultValue={sp.get("q") ?? ""} aria-label="Search"
        onChange={(e) => set("q", e.target.value || null)} className={`${sel} w-full sm:w-64`} />
      <select aria-label="Decision" className={sel} value={sp.get("d") ?? ""} onChange={(e) => set("d", e.target.value || null)}>
        {DECISIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <select aria-label="Area" className={sel} value={sp.get("a") ?? ""} onChange={(e) => set("a", e.target.value || null)}>
        <option value="">All areas</option>
        {areas.map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
      <select aria-label="Sort" className={sel} value={sp.get("s") ?? "recent"} onChange={(e) => set("s", e.target.value === "recent" ? null : e.target.value)}>
        <option value="recent">Newest first</option>
        <option value="priority">Highest priority</option>
      </select>
      <div className="flex flex-wrap gap-1.5">
        {FLAGS.map(([f, l]) => (
          <button key={f} type="button" onClick={() => toggle(f)} aria-pressed={flags.has(f)}
            className={`focus-ring h-8 rounded-full border px-3 text-xs transition ${flags.has(f) ? "border-ink bg-ink text-surface" : "border-line bg-surface text-ink-2 hover:border-line-strong"}`}>{l}</button>
        ))}
      </div>
      {sp.toString() && <button type="button" onClick={() => start(() => router.replace(path))} className="text-xs text-accent-ink underline">Clear</button>}
    </div>
  );
}

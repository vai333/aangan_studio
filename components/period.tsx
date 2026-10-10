import Link from "next/link";
import { PERIODS, type PeriodKey } from "@/lib/metrics";

export function PeriodSwitch({ current, base }: { current: PeriodKey; base: string }) {
  return (
    <div className="inline-flex shrink-0 rounded-full border border-line bg-surface p-0.5 text-sm" role="tablist" aria-label="Period">
      {PERIODS.map((p) => (
        <Link key={p.key} href={`${base}?p=${p.key}`} role="tab" aria-selected={p.key === current}
          className={`focus-ring whitespace-nowrap rounded-full px-3 py-1 transition ${p.key === current ? "bg-ink font-medium text-surface" : "text-ink-2 hover:text-ink"}`}>
          {p.label}
        </Link>
      ))}
    </div>
  );
}

export const parsePeriod = (v: string | string[] | undefined): PeriodKey =>
  (PERIODS.some((p) => p.key === v) ? v : "30d") as PeriodKey;

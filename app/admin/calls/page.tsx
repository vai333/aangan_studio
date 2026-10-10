import Link from "next/link";
import { Suspense } from "react";
import { DecisionBadge, Empty, Flags, Pips, PriorityMeter } from "@/components/ui";
import { getSettings, listRecords, now } from "@/lib/data/repo";
import { fmtDuration, fmtWhen, maskPhone } from "@/lib/format";
import { effectiveDecision, isQualified } from "@/lib/types";
import { callerName, flagsFor, projectLine } from "@/lib/view";
import { CallFilters } from "./filters";
import { ImportBox } from "./import-box";
import { SyncButton } from "./sync-button";

type SP = { d?: string; a?: string; f?: string; q?: string; s?: string };

export default async function Calls({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [records, settings] = await Promise.all([listRecords(), getSettings()]);
  const t = now().getTime();
  const flagsWanted = (sp.f ?? "").split(",").filter(Boolean);

  const rows = records
    .filter((r) => !r.call.merged_into)
    .map((r) => ({ r, d: effectiveDecision(r.assessment), flags: flagsFor(r, records) }))
    .filter(({ r, d, flags }) => {
      if (sp.d === "qualified" ? !isQualified(d) : sp.d && d !== sp.d) return false;
      if (sp.a && r.assessment?.grading.extracted.locality !== sp.a) return false;
      for (const f of flagsWanted) {
        if (f === "unacked") { if (!(r.handoff?.sent_at && !r.handoff.acknowledged_at)) return false; }
        else if (!flags.includes(f as never)) return false;
      }
      if (sp.q) {
        const hay = [callerName(r), projectLine(r), r.assessment?.grading.summary, r.call.source_label, r.call.transcript.map((t) => t.text).join(" ")].join(" ").toLowerCase();
        if (!hay.includes(sp.q.toLowerCase())) return false;
      }
      return true;
    })
    .sort((x, y) => sp.s === "priority"
      ? (y.r.assessment?.priority ?? 0) - (x.r.assessment?.priority ?? 0)
      : y.r.call.started_at.localeCompare(x.r.call.started_at));

  const areas = [...new Set(records.map((r) => r.assessment?.grading.extracted.locality).filter((x): x is string => !!x))].sort();

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Every call, graded</p>
          <h1 className="font-display text-3xl">Calls</h1>
        </div>
        <div className="flex items-center gap-4"><SyncButton /><p className="text-sm text-muted tnum">{rows.length} of {records.filter((r) => !r.call.merged_into).length}</p></div>
      </header>
      <ImportBox />
      <Suspense><CallFilters areas={areas} /></Suspense>

      <div className="card overflow-hidden">
        {/* Desktop table */}
        <table className="hidden w-full text-sm md:table">
          <thead className="border-b border-line bg-surface-2/60 text-left text-xs text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">When</th>
              <th className="px-4 py-2.5 font-medium">Caller & project</th>
              <th className="px-4 py-2.5 font-medium" title="Services check, then qualified.md criteria 1–5">Gate</th>
              <th className="px-4 py-2.5 font-medium">Decision</th>
              <th className="px-4 py-2.5 font-medium">Priority</th>
              <th className="px-4 py-2.5 font-medium">Designer</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(({ r, d, flags }) => (
              <tr key={r.call.id} className="group relative hover:bg-surface-2/60">
                <td className="whitespace-nowrap px-4 py-3 align-top tnum">
                  <Link href={`/admin/calls/${r.call.id}`} className="absolute inset-0" aria-label={`Open ${projectLine(r)}`} />
                  <span className="block">{fmtWhen(r.call.started_at)}</span>
                  <span className="block text-xs text-muted">{r.call.status === "missed" ? "Missed" : fmtDuration(r.call.duration_sec)}{r.call.source_label ? ` · ${r.call.source_label.replace(/[ab]$/, "")}` : ""}</span>
                </td>
                <td className="px-4 py-3 align-top">
                  <span className="block font-medium">{projectLine(r)}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">{callerName(r)} · {maskPhone(r.call.caller_phone)} <Flags flags={flags} /></span>
                </td>
                <td className="px-4 py-3 align-top"><Pips criteria={r.assessment?.grading.criteria ?? null} /></td>
                <td className="px-4 py-3 align-top"><DecisionBadge d={d} overridden={!!r.assessment?.override} /></td>
                <td className="px-4 py-3 align-top"><PriorityMeter value={r.assessment?.priority ?? 0} muted={!isQualified(d) && d !== "NURTURE"} /></td>
                <td className="px-4 py-3 align-top text-xs">
                  {r.handoff ? (
                    <>
                      <span className="block text-ink-2">{r.handoff.designer_name}</span>
                      <span className={r.handoff.acknowledged_at ? "text-good" : t - new Date(r.handoff.sent_at ?? 0).getTime() > settings.policy.unack_hours * 3600e3 ? "text-bad" : "text-warn"}>
                        {r.handoff.acknowledged_at ? "✓ Picked up" : "Not picked up"}
                      </span>
                    </>
                  ) : <span className="text-muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Mobile cards */}
        <ul className="divide-y divide-line md:hidden">
          {rows.map(({ r, d, flags }) => (
            <li key={r.call.id}>
              <Link href={`/admin/calls/${r.call.id}`} className="block space-y-1.5 px-4 py-3">
                <span className="flex items-center justify-between gap-2"><span className="font-medium">{projectLine(r)}</span><DecisionBadge d={d} /></span>
                <span className="flex items-center justify-between text-xs text-muted"><span>{fmtWhen(r.call.started_at)} · {callerName(r)}</span><Pips criteria={r.assessment?.grading.criteria ?? null} /></span>
                <Flags flags={flags} />
              </Link>
            </li>
          ))}
        </ul>
        {!rows.length && <div className="p-6"><Empty>No calls match these filters.</Empty></div>}
      </div>
      <p className="text-xs text-muted">
        Gate: first tile = in our services (services.md), then Nikhil&apos;s five — real project · area · timeline · budget · decision-maker. ✓ pass · ? unclear · ✗ fail.
      </p>
    </div>
  );
}

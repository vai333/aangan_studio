import Link from "next/link";
import { Suspense } from "react";
import { DecisionBadge, Empty, Flags } from "@/components/ui";
import { listRecords } from "@/lib/data/repo";
import { fmtDuration, fmtWhen, maskPhone } from "@/lib/format";
import { effectiveDecision, type CallRecord } from "@/lib/types";
import { callerName, flagsFor, projectLine } from "@/lib/view";
import { TranscriptSearch } from "./search";

function Marked({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return <>{parts.map((p, i) => (p.toLowerCase() === q.toLowerCase() ? <mark key={i} className="evidence active">{p}</mark> : p))}</>;
}

const turns = (r: CallRecord) => r.call.transcript.length;

export default async function Transcripts({ searchParams }: { searchParams: Promise<{ id?: string; q?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const all = (await listRecords()).filter((r) => !r.call.merged_into);
  const withText = all.filter((r) => turns(r) > 0 || r.call.status === "missed");
  const list = (q ? withText.filter((r) => r.call.transcript.some((t) => t.text.toLowerCase().includes(q.toLowerCase()))) : withText)
    .sort((a, b) => b.call.started_at.localeCompare(a.call.started_at));
  const sel = list.find((r) => r.call.id === sp.id) ?? list[0] ?? null;
  const merged = sel ? (await listRecords()).filter((o) => o.call.merged_into === sel.call.id) : [];
  const hits = (r: CallRecord) => (q ? r.call.transcript.filter((t) => t.text.toLowerCase().includes(q.toLowerCase())).length : 0);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Every conversation, word for word</p>
          <h1 className="font-display text-3xl">Transcripts</h1>
        </div>
        <Suspense><TranscriptSearch /></Suspense>
      </header>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <aside className="card max-h-[78vh] overflow-y-auto p-2">
          {list.length ? (
            <ul className="divide-y divide-line">
              {list.map((r) => (
                <li key={r.call.id}>
                  <Link href={`/admin/transcripts?id=${r.call.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`} aria-current={sel?.call.id === r.call.id}
                    className={`block rounded-xl px-3 py-2.5 ${sel?.call.id === r.call.id ? "bg-accent-soft/60" : "hover:bg-surface-2"}`}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{projectLine(r)}</span>
                      {q && <span className="shrink-0 rounded-full bg-surface-2 px-1.5 text-[11px] tnum">{hits(r)}</span>}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">{fmtWhen(r.call.started_at)} · {r.call.status === "missed" ? "missed" : fmtDuration(r.call.duration_sec)} · {callerName(r)}</span>
                    <span className="mt-0.5 block truncate text-xs text-ink-2">{r.call.transcript.find((t) => t.speaker === "caller")?.text ?? (r.call.status === "missed" ? "No conversation" : "—")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <div className="p-3"><Empty>{q ? `No transcript mentions “${q}”.` : "No transcripts yet. Calls appear here seconds after they end."}</Empty></div>}
        </aside>

        <section className="card flex max-h-[78vh] flex-col p-5">
          {sel ? (
            <>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
                <div className="min-w-0">
                  <p className="eyebrow mb-1">{fmtWhen(sel.call.started_at)} · {sel.call.status === "missed" ? "missed call" : fmtDuration(sel.call.duration_sec)} · {maskPhone(sel.call.caller_phone)}</p>
                  <h2 className="font-display text-xl">{projectLine(sel)}</h2>
                  <div className="mt-2"><Flags flags={flagsFor(sel, all)} withLabels /></div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <DecisionBadge d={effectiveDecision(sel.assessment)} overridden={!!sel.assessment?.override} />
                  <Link href={`/admin/calls/${sel.call.id}`} className="text-sm text-accent-ink hover:underline">Open full call →</Link>
                </div>
              </div>
              {sel.call.recording_url && <audio controls preload="none" src={sel.call.recording_url} className="mb-3 h-9 w-full" />}
              <div className="-mr-2 flex-1 space-y-3 overflow-y-auto pr-2">
                {merged.flatMap((m) => m.call.transcript).length > 0 && (
                  <>
                    <p className="text-center text-xs text-muted">— Earlier call from this number (dropped) —</p>
                    {merged.flatMap((m) => m.call.transcript).map((t, i) => <Bubble key={`m${i}`} who={t.speaker}>{t.text}</Bubble>)}
                    <p className="text-center text-xs text-muted">— Redial, merged into one enquiry —</p>
                  </>
                )}
                {sel.call.transcript.map((t, i) => <Bubble key={i} who={t.speaker}><Marked text={t.text} q={q} /></Bubble>)}
                {!sel.call.transcript.length && <p className="text-sm text-muted">The call wasn&apos;t picked up, so there is no conversation. It&apos;s in the callback queue.</p>}
              </div>
            </>
          ) : <Empty>Select a call.</Empty>}
        </section>
      </div>
    </div>
  );
}

function Bubble({ who, children }: { who: "agent" | "caller"; children: React.ReactNode }) {
  const agent = who === "agent";
  return (
    <div className={`flex ${agent ? "justify-start" : "justify-end"}`}>
      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${agent ? "rounded-tl-md bg-surface-2" : "rounded-tr-md border border-line bg-surface"}`}>
        <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider text-muted">{agent ? "Aangan" : "Caller"}</span>
        {children}
      </div>
    </div>
  );
}

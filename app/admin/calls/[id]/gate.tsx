"use client";
// The gate and the transcript share state: click a criterion and its evidence
// lights up in the conversation, so any verdict can be checked in one glance.
import { useMemo, useState } from "react";
import { VerdictGlyph, VERDICT_VAR } from "@/components/ui";
import { CRITERION_LABEL, CRITERION_SOURCE, type CriterionKey, type Judgement, type TranscriptTurn } from "@/lib/types";

const KEYS: CriterionKey[] = ["scope", "real_project", "service_area", "timeline", "budget", "decision_maker"];

function highlight(text: string, needles: { key: CriterionKey; q: string }[], active: CriterionKey | null) {
  const hits: { start: number; end: number; key: CriterionKey }[] = [];
  const lower = text.toLowerCase();
  for (const n of needles) {
    // evidence may span "..." — match each fragment
    for (const frag of n.q.split(/\.\.\.|…/).map((f) => f.trim()).filter((f) => f.length > 3)) {
      const i = lower.indexOf(frag.toLowerCase());
      if (i >= 0 && !hits.some((h) => i < h.end && i + frag.length > h.start)) hits.push({ start: i, end: i + frag.length, key: n.key });
    }
  }
  if (!hits.length) return text;
  hits.sort((a, b) => a.start - b.start);
  const out: React.ReactNode[] = [];
  let pos = 0;
  hits.forEach((h, idx) => {
    out.push(text.slice(pos, h.start));
    out.push(<mark key={idx} id={`ev-${h.key}`} className={`evidence ${active === h.key ? "active" : ""}`} title={CRITERION_LABEL[h.key]}>{text.slice(h.start, h.end)}</mark>);
    pos = h.end;
  });
  out.push(text.slice(pos));
  return out;
}

export function GateAndTranscript({ criteria, transcript, mergedTranscript, status }: {
  criteria: Record<CriterionKey, Judgement> | null; transcript: TranscriptTurn[]; mergedTranscript: TranscriptTurn[]; status: string;
}) {
  const [active, setActive] = useState<CriterionKey | null>(null);
  const needles = useMemo(() => (criteria ? KEYS.filter((k) => criteria[k].evidence).map((k) => ({ key: k, q: criteria[k].evidence! })) : []), [criteria]);

  const pick = (k: CriterionKey) => {
    setActive((a) => (a === k ? null : k));
    requestAnimationFrame(() => document.getElementById(`ev-${k}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <section className="card p-5">
        <p className="eyebrow mb-1">The gate</p>
        <h2 className="font-display mb-4 text-lg">Each verdict, with the caller&apos;s own words</h2>
        {criteria ? (
          <ol className="space-y-2">
            {KEYS.map((k, i) => {
              const j = criteria[k];
              return (
                <li key={k}>
                  {i === 1 && <p className="eyebrow mb-2 mt-4">Nikhil&apos;s five · qualified.md</p>}
                  <button type="button" onClick={() => pick(k)} disabled={!j.evidence} aria-pressed={active === k}
                    className={`focus-ring w-full rounded-xl border p-3 text-left transition ${active === k ? "border-accent bg-accent-soft/50" : "border-line hover:border-line-strong"} ${!j.evidence ? "cursor-default" : ""}`}>
                    <span className="flex items-center gap-2.5">
                      <VerdictGlyph v={j.verdict} size={18} />
                      <span className="font-medium">{CRITERION_LABEL[k]}</span>
                      <span className="text-xs text-muted">{CRITERION_SOURCE[k]}</span>
                      <span className="ml-auto flex items-center gap-1.5 text-xs text-muted tnum" title="Grader confidence">
                        <span className="h-1 w-10 overflow-hidden rounded-full bg-surface-2"><span className="block h-full" style={{ width: `${j.confidence * 100}%`, background: VERDICT_VAR[j.verdict] }} /></span>
                        {Math.round(j.confidence * 100)}%
                      </span>
                    </span>
                    {j.evidence && <span className="mt-2 block border-l-2 border-line-strong pl-3 text-sm italic text-ink-2">“{j.evidence}”</span>}
                    {j.note && <span className="mt-1.5 block text-xs text-ink-2">{j.note}</span>}
                    {!j.evidence && !j.note && <span className="mt-1.5 block text-xs text-muted">Nothing said on this.</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        ) : <p className="text-sm text-muted">Not graded yet.</p>}
      </section>

      <section className="card flex max-h-[880px] flex-col p-5">
        <p className="eyebrow mb-1">Transcript</p>
        <h2 className="font-display mb-4 text-lg">{status === "missed" ? "No conversation" : "The call"}</h2>
        <div className="-mr-2 flex-1 space-y-3 overflow-y-auto pr-2">
          {mergedTranscript.length > 0 && (
            <>
              <p className="text-center text-xs text-muted">— Earlier call from this number (dropped) —</p>
              {mergedTranscript.map((t, i) => <Bubble key={`m${i}`} t={t}>{t.text}</Bubble>)}
              <p className="text-center text-xs text-muted">— Redial, merged into one enquiry —</p>
            </>
          )}
          {transcript.map((t, i) => <Bubble key={i} t={t}>{highlight(t.text, needles, active)}</Bubble>)}
          {!transcript.length && !mergedTranscript.length && <p className="text-sm text-muted">The call wasn&apos;t picked up, so there is nothing to grade. It&apos;s in the callback queue.</p>}
        </div>
      </section>
    </div>
  );
}

function Bubble({ t, children }: { t: TranscriptTurn; children: React.ReactNode }) {
  const agent = t.speaker === "agent";
  return (
    <div className={`flex ${agent ? "justify-start" : "justify-end"}`}>
      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${agent ? "rounded-tl-md bg-surface-2" : "rounded-tr-md border border-line bg-surface"}`}>
        <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider text-muted">{agent ? "Aangan" : "Caller"}</span>
        {children}
      </div>
    </div>
  );
}

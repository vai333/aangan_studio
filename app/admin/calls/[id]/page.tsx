import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, DecisionBadge, Flags, PriorityMeter } from "@/components/ui";
import { getSettings, listRecords, now } from "@/lib/data/repo";
import { checkArea } from "@/lib/areas";
import { fmtAgo, fmtDuration, fmtSqft, fmtWhen } from "@/lib/format";
import { effectiveDecision, isQualified, type CallRecord } from "@/lib/types";
import { callerName, flagsFor, projectLine } from "@/lib/view";
import { addAreaAction, markPickedUpAction, resolveAction } from "../../actions";
import { GateAndTranscript } from "./gate";
import { hubspotUrl } from "@/lib/hubspot/urls";
import { PushButton } from "./hubspot-card";
import { OverrideForm } from "./override";

function facts(r: CallRecord): [string, string][] {
  const x = r.assessment?.grading.extracted;
  if (!x) return [];
  const rows: [string, string | null][] = [
    ["Name", x.name], ["Locality", x.locality],
    ["Property", [x.bhk ? `${x.bhk}BHK` : null, x.property_type?.replace("_", " "), x.carpet_sqft ? `${fmtSqft(x.carpet_sqft)} carpet` : null].filter(Boolean).join(" · ") || null],
    ["Rooms in scope", x.rooms_in_scope.join(", ") || null], ["Current state", x.current_state], ["Timeline", x.timeline_text],
    ["Decision-maker", x.decision_maker_status], ["Budget (volunteered)", x.budget_volunteered], ["Found us via", x.referral_source],
    ["Preferred consult", x.preferred_consult_slot], ["Language", x.language === "en" ? null : x.language], ["Mood", x.sentiment === "neutral" ? null : x.sentiment],
  ];
  return rows.filter((r): r is [string, string] => !!r[1]);
}

export default async function CallDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [records, settings] = await Promise.all([listRecords(), getSettings()]);
  const r = records.find((x) => x.call.id === id);
  if (!r) notFound();
  const t = now().getTime();
  const a = r.assessment;
  const d = effectiveDecision(a);
  const merged = records.filter((o) => o.call.merged_into === r.call.id);
  const parent = r.call.merged_into ? records.find((o) => o.call.id === r.call.merged_into) : null;
  const area = a ? checkArea(a.grading.extracted.locality, settings.areas_in, settings.areas_out) : null;
  const areaFixable = d === "INCOMPLETE" && area?.verdict === "unclear" && a?.grading.extracted.locality;
  const f = facts(r);

  return (
    <div className="space-y-5">
      <Link href="/admin/calls" className="text-sm text-muted hover:text-ink">← All calls</Link>

      {parent && (
        <div className="card p-4 text-sm">This dropped call was merged into the redial. <Link className="text-accent-ink underline" href={`/admin/calls/${parent.call.id}`}>Open the merged enquiry →</Link></div>
      )}

      <header className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow mb-1.5">{fmtWhen(r.call.started_at)} · {r.call.status === "missed" ? "missed call" : fmtDuration(r.call.duration_sec)}{r.call.source_label ? ` · ${r.call.source_label.replace(/[ab]$/, "")}` : ""}</p>
            <h1 className="font-display text-[26px] leading-tight sm:text-3xl">{projectLine(r)}</h1>
            <p className="mt-1.5 text-ink-2">
              {callerName(r)} · <a href={`tel:${r.call.caller_phone}`} className="tnum underline decoration-line-strong underline-offset-2">{r.call.caller_phone}</a>
            </p>
            <div className="mt-3"><Flags flags={flagsFor(r, records)} withLabels /></div>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <DecisionBadge d={d} overridden={!!a?.override} size="lg" />
            {a && (isQualified(d) || d === "NURTURE") && <PriorityMeter value={a.priority} />}
          </div>
        </div>
        {a && (
          <div className="mt-5 grid gap-4 border-t border-line pt-4 md:grid-cols-[1.4fr_1fr]">
            <div>
              <p className="eyebrow mb-1.5">Summary for the designer</p>
              <p className="leading-relaxed">{a.grading.summary}</p>
            </div>
            <div>
              <p className="eyebrow mb-1.5">Why this decision</p>
              <ul className="space-y-1 text-sm text-ink-2">{a.decision_reasons.map((x) => <li key={x}>• {x}</li>)}</ul>
              {areaFixable && (
                <form action={addAreaAction.bind(null, r.call.id, a.grading.extracted.locality!)} className="mt-3">
                  <button className="focus-ring rounded-full bg-accent px-3.5 py-1.5 text-sm font-medium text-white">We serve {a.grading.extracted.locality} — add it & re-decide</button>
                </form>
              )}
            </div>
          </div>
        )}
      </header>

      <GateAndTranscript criteria={a?.grading.criteria ?? null} transcript={r.call.transcript} mergedTranscript={merged.flatMap((m) => m.call.transcript)} status={r.call.status} />

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card eyebrow="Already asked — don't re-ask" title="What the designer already knows">
          {f.length ? (
            <dl className="grid grid-cols-[minmax(0,9rem)_1fr] gap-x-4 gap-y-2 text-sm">
              {f.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd>{v}</dd></div>)}
            </dl>
          ) : <p className="text-sm text-muted">Nothing captured.</p>}
          {a?.grading.open_points.length ? (
            <>
              <p className="eyebrow mb-2 mt-5">Open points for the consultation</p>
              <ul className="space-y-1 text-sm">{a.grading.open_points.map((o) => <li key={o}>• {o}</li>)}</ul>
            </>
          ) : null}
        </Card>

        <div className="space-y-4">
          {r.escalation && (
            <Card eyebrow={r.escalation.kind.replace("_", " ")} title={r.escalation.reason}>
              <p className="text-sm text-ink-2">Opened {fmtAgo(r.escalation.created_at, t)} ago · {r.escalation.status === "open" ? <b className="text-bad">open</b> : <>resolved {r.escalation.resolved_at ? fmtAgo(r.escalation.resolved_at, t) + " ago" : ""}</>}</p>
              {r.escalation.status === "open" && (
                <form action={resolveAction.bind(null, r.escalation.id)} className="mt-3"><button className="focus-ring rounded-full bg-ink px-4 py-2 text-sm font-medium text-surface">Mark done</button></form>
              )}
            </Card>
          )}

          {r.hubspot && r.hubspot.status !== "skipped" && (
            <Card eyebrow="HubSpot · founder's view" title={r.hubspot.status === "synced" ? "In HubSpot" : "Not in HubSpot yet"}
              action={<PushButton callId={r.call.id} label={r.hubspot.status === "synced" ? "Re-sync" : "Retry"} />}>
              {r.hubspot.status === "synced" ? (
                <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                  {r.hubspot.contact_id && (r.hubspot.portal_id ? <a className="text-accent-ink underline" href={hubspotUrl(r.hubspot.portal_id, "contact", r.hubspot.contact_id, r.hubspot.ui_domain)} target="_blank" rel="noreferrer">Contact ↗</a> : <span>Contact {r.hubspot.contact_id}</span>)}
                  {r.hubspot.deal_id && (r.hubspot.portal_id ? <a className="text-accent-ink underline" href={hubspotUrl(r.hubspot.portal_id, "deal", r.hubspot.deal_id, r.hubspot.ui_domain)} target="_blank" rel="noreferrer">Deal ↗</a> : <span>Deal {r.hubspot.deal_id}</span>)}
                  <span className="text-muted">Note with summary, gate and transcript attached{r.hubspot.synced_at ? ` · ${fmtWhen(r.hubspot.synced_at)}` : ""}</span>
                </p>
              ) : (
                <p className="text-sm text-bad">{r.hubspot.last_error ?? "Waiting for the next sync."} <span className="text-muted">(attempt {r.hubspot.attempts}; retried automatically up to 5 times)</span></p>
              )}
            </Card>
          )}

          {r.report && (
            <Card eyebrow="Call report email" title={`Sent to ${r.report.to_email}`}
              action={<span className={`text-sm ${r.report.status === "sent" ? "text-good" : "text-bad"}`}>{r.report.status === "sent" && r.report.sent_at ? `✓ ${fmtWhen(r.report.sent_at)}` : r.report.status}</span>}>
              <p className="rounded-lg bg-surface-2 px-3 py-2 font-mono text-[13px]">{r.report.subject}</p>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-accent-ink">Show full email</summary>
                <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-line p-3 text-[12.5px] leading-relaxed">{r.report.body_text}</pre>
              </details>
            </Card>
          )}

          {r.handoff && (
            <Card eyebrow="Email sent to designer" title={r.handoff.designer_name}
              action={r.handoff.acknowledged_at
                ? <span className="text-sm text-good">✓ Picked up {fmtAgo(r.handoff.acknowledged_at, t)} ago</span>
                : <form action={markPickedUpAction.bind(null, r.handoff.id)}><button className="text-sm text-accent-ink underline">Mark picked up</button></form>}>
              <p className="text-xs text-muted">To {r.handoff.designer_email}{r.handoff.cc.length ? ` · cc ${r.handoff.cc.join(", ")}` : ""} · {r.handoff.status} {r.handoff.sent_at ? fmtWhen(r.handoff.sent_at) : ""}</p>
              <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 font-mono text-[13px]">{r.handoff.subject}</p>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-accent-ink">Show full email</summary>
                <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-line p-3 text-[12.5px] leading-relaxed">{r.handoff.body_text}</pre>
              </details>
            </Card>
          )}

          {a && (
            <Card eyebrow="Audit" title="How this was decided">
              <dl className="grid grid-cols-[8rem_1fr] gap-y-1.5 text-sm">
                <dt className="text-muted">Grader</dt><dd>{a.model} · {a.prompt_version}</dd>
                <dt className="text-muted">Rules</dt><dd>lib/decision.ts · {a.rubric_version}</dd>
                <dt className="text-muted">Graded</dt><dd>{fmtWhen(a.created_at)}</dd>
                <dt className="text-muted">Recording</dt><dd>{r.call.recording_url ? <audio controls preload="none" src={r.call.recording_url} className="h-8 w-full" /> : "—"}</dd>
              </dl>
              {(isQualified(d) || d === "NURTURE") && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-accent-ink">Priority {a.priority} — how it adds up</summary>
                  <ul className="mt-2 space-y-0.5 text-ink-2">{a.priority_reasons.map((x) => <li key={x}>• {x}</li>)}</ul>
                  <p className="mt-2 text-xs text-muted">Priority only orders the designer queue. It never overrides the gate.</p>
                </details>
              )}
              <div className="mt-4"><OverrideForm callId={r.call.id} current={a.decision} override={a.override} /></div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

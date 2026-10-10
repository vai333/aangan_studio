import Link from "next/link";
import { Card, DecisionBadge, Empty, Flags, PriorityMeter } from "@/components/ui";
import { getSettings, listRecords, now } from "@/lib/data/repo";
import { fmtAgo, fmtWhen } from "@/lib/format";
import { computeMetrics, periodRange } from "@/lib/metrics";
import { effectiveDecision, type CallRecord } from "@/lib/types";
import { callerName, flagsFor, projectLine } from "@/lib/view";
import { markPickedUpAction, resolveAction } from "../actions";

function Row({ r, all, t, right, meta }: { r: CallRecord; all: CallRecord[]; t: number; right?: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-3 sm:flex-nowrap">
      <Link href={`/admin/calls/${r.call.id}`} className="min-w-0 flex-1 rounded-lg hover:text-accent-ink">
        <span className="flex items-center gap-2"><span className="truncate font-medium">{projectLine(r)}</span><Flags flags={flagsFor(r, all).filter((f) => f !== "after")} /></span>
        <span className="block truncate text-xs text-muted">{callerName(r)} · {r.call.caller_phone} · {fmtWhen(r.call.started_at)} ({fmtAgo(r.call.started_at, t)} ago)</span>
        {meta && <span className="mt-1 block text-sm text-ink-2">{meta}</span>}
      </Link>
      <div className="flex shrink-0 items-center gap-2">{right}</div>
    </li>
  );
}

const Done = ({ id, label = "Done" }: { id: string; label?: string }) => (
  <form action={resolveAction.bind(null, id)}><button className="focus-ring rounded-full border border-line px-3 py-1.5 text-sm hover:border-ink">{label}</button></form>
);

export default async function Queue() {
  const [records, s] = await Promise.all([listRecords(), getSettings()]);
  const tNow = now();
  const t = tNow.getTime();
  const m = computeMetrics(records, s, periodRange("all", tNow), tNow);
  const open = (k: string[]) => records.filter((r) => r.escalation?.status === "open" && k.includes(r.escalation.kind));

  const escalations = open(["existing_client"]);
  const callbacks = open(["callback", "service_recovery"]).sort((a, b) => (a.escalation!.kind === "service_recovery" ? -1 : 0) - (b.escalation!.kind === "service_recovery" ? -1 : 0));
  const areas = open(["area_review"]);
  const nurture = records.filter((r) => !r.call.merged_into && effectiveDecision(r.assessment) === "NURTURE");
  const resolved = records.filter((r) => r.escalation?.status === "resolved").slice(0, 6);
  const total = escalations.length + callbacks.length + m.unacked.length + areas.length;

  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow mb-1">Needs you</p>
        <h1 className="font-display text-3xl">{total ? `${total} thing${total === 1 ? "" : "s"} to close today` : "All clear"}</h1>
        <p className="mt-1.5 text-ink-2">Ordered by how much it costs to wait. Nothing here is a lead the grader forwarded blindly.</p>
      </header>

      <Card eyebrow="1 · Existing clients" title="Escalations — call back within 15 minutes">
        {escalations.length ? (
          <ul className="divide-y divide-line">{escalations.map((r) => <Row key={r.call.id} r={r} all={records} t={t} meta={r.escalation!.reason} right={<Done id={r.escalation!.id} label="Called back" />} />)}</ul>
        ) : <Empty>No open complaints. Existing-client calls skip the rubric and land here — and in Nikhil&apos;s inbox — the moment they hang up.</Empty>}
      </Card>

      <Card eyebrow="2 · Callbacks" title="Missed, dropped, or still unclear after the call">
        {callbacks.length ? (
          <ul className="divide-y divide-line">{callbacks.map((r) => (
            <Row key={r.call.id} r={r} all={records} t={t}
              meta={<>{r.escalation!.kind === "service_recovery" && <b className="text-bad">Service recovery · </b>}{r.escalation!.reason}</>}
              right={<><a href={`tel:${r.call.caller_phone}`} className="focus-ring rounded-full bg-ink px-3 py-1.5 text-sm font-medium text-surface">Call</a><Done id={r.escalation!.id} /></>} />
          ))}</ul>
        ) : <Empty>No callbacks pending.</Empty>}
      </Card>

      <Card eyebrow={`3 · Designer pickup (> ${s.policy.unack_hours} h)`} title="Qualified leads nobody has acknowledged">
        {m.unacked.length ? (
          <ul className="divide-y divide-line">{m.unacked.sort((a, b) => (b.assessment?.priority ?? 0) - (a.assessment?.priority ?? 0)).map((r) => (
            <Row key={r.call.id} r={r} all={records} t={t}
              meta={<>Emailed to <b>{r.handoff!.designer_name}</b> {fmtAgo(r.handoff!.sent_at!, t)} ago — no click on Acknowledge yet.</>}
              right={<><PriorityMeter value={r.assessment!.priority} /><form action={markPickedUpAction.bind(null, r.handoff!.id)}><button className="focus-ring rounded-full border border-line px-3 py-1.5 text-sm hover:border-ink">Picked up</button></form></>} />
          ))}</ul>
        ) : <Empty>Every qualified lead has a designer on it.</Empty>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card eyebrow="4 · Service area" title="Localities to confirm">
          {areas.length ? (
            <ul className="divide-y divide-line">{areas.map((r) => <Row key={r.call.id} r={r} all={records} t={t} meta={r.escalation!.reason} />)}</ul>
          ) : <Empty>No unknown localities waiting. Unknown areas are marked “unclear”, never “fail” — you decide once and the list remembers.</Empty>}
        </Card>
        <Card eyebrow="5 · Keep warm" title="Real projects, wrong timing">
          {nurture.length ? (
            <ul className="divide-y divide-line">{nurture.map((r) => <Row key={r.call.id} r={r} all={records} t={t} meta={r.assessment!.grading.open_points.at(-1) ?? r.assessment!.decision_reasons[0]} right={<DecisionBadge d="NURTURE" />} />)}</ul>
          ) : <Empty>Nothing to nurture.</Empty>}
        </Card>
      </div>

      {resolved.length > 0 && (
        <details className="card p-5">
          <summary className="cursor-pointer text-sm font-medium">Recently closed ({resolved.length})</summary>
          <ul className="mt-2 divide-y divide-line">{resolved.map((r) => <Row key={r.call.id} r={r} all={records} t={t}
            meta={<>{r.escalation!.reason} — closed {r.escalation!.resolved_at ? `${Math.round((new Date(r.escalation!.resolved_at).getTime() - new Date(r.escalation!.created_at).getTime()) / 60000)} min after it opened` : ""}</>} />)}</ul>
        </details>
      )}
    </div>
  );
}

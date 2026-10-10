import Link from "next/link";
import { ClockDial, Funnel, SegmentBar, BarList } from "@/components/charts";
import { parsePeriod, PeriodSwitch } from "@/components/period";
import { Card, DecisionBadge, DECISION_VAR, Empty, Flags, Pips, PriorityMeter, Stat } from "@/components/ui";
import { getSettings, listRecords, now } from "@/lib/data/repo";
import { fmtAgo, fmtDuration, fmtWhen, inr, inrRange, pct } from "@/lib/format";
import { computeMetrics, periodRange, PERIODS } from "@/lib/metrics";
import { DECISION_LABEL, DECLINE_LABEL, effectiveDecision, isQualified, type Decision } from "@/lib/types";
import { callerName, flagsFor, projectLine } from "@/lib/view";
import { mode } from "@/lib/data/repo";
import { vaaniStatus } from "@/lib/vaani/status";

const ORDER: Decision[] = ["QUALIFIED", "QUALIFIED_WITH_NOTES", "NURTURE", "INCOMPLETE", "ESCALATION", "NOT_QUALIFIED"];

export default async function Today({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const p = parsePeriod((await searchParams).p);
  const [records, s] = await Promise.all([listRecords(), getSettings()]);
  const vs = mode() === "live" && records.length === 0 ? await vaaniStatus() : null;
  const t = now();
  const range = periodRange(p, t);
  const m = computeMetrics(records, s, range, t);
  const periodLabel = PERIODS.find((x) => x.key === p)!.label.toLowerCase();

  const queue = records
    .filter((r) => !r.call.merged_into && isQualified(effectiveDecision(r.assessment)) && !r.handoff?.acknowledged_at)
    .sort((a, b) => (b.assessment?.priority ?? 0) - (a.assessment?.priority ?? 0))
    .slice(0, 4);
  const attention = m.openEscalations.length + m.unacked.length;
  const roi = m.cost.total ? m.pipelineLow / m.cost.total : 0;

  return (
    <div className="space-y-6">
      {vs && vs.events.count === 0 && (
        <Link href="/admin/settings#vaani" className="card block border-warn p-4 text-sm hover:border-ink">
          <b>No call has reached the desk yet.</b> <span className="text-ink-2">Vaani hasn&apos;t sent this site any event: {!vs.agent.published ? "the agent isn't published, " : ""}{!vs.agent.inboundNumber ? "no phone number is assigned, " : ""}and the webhook address may not be set. See the checklist →</span>
        </Link>
      )}

      {/* The 5-second answer */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-3xl">
          <p className="eyebrow mb-2">{t.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" })}</p>
          <h1 className="font-display text-[28px] leading-[1.2] sm:text-[34px]">
            {m.enquiries} calls in the last {periodLabel}. <span className="text-ink-2">{m.answered} answered,</span>{" "}
            <span className="text-accent-ink">{m.qualified} sent to designers</span> with everything already asked.
          </h1>
          <p className="mt-2 text-[15px] text-ink-2">
            {attention > 0
              ? <><Link href="/admin/queue" className="font-semibold text-ink underline decoration-accent decoration-2 underline-offset-4">{attention} thing{attention === 1 ? "" : "s"} need{attention === 1 ? "s" : ""} you</Link> — {m.openEscalations.length} callback{m.openEscalations.length === 1 ? "" : "s"} or escalation{m.openEscalations.length === 1 ? "" : "s"}, {m.unacked.length} lead{m.unacked.length === 1 ? "" : "s"} no designer has picked up.</>
              : "Nothing needs you right now."}
          </p>
        </div>
        <PeriodSwitch current={p} base="/admin" />
      </header>

      {/* Five numbers Nikhil used to pull by hand */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Calls answered" value={pct(m.answeredRate)} sub={m.missed ? `${m.missed} missed · target 100%` : "Target 100% · met"} tone={m.missed ? "warn" : "good"} />
        <Stat label="First response" value={m.medianAnswerSec !== null ? fmtDuration(m.medianAnswerSec) : "Instant"} sub={m.medianHandoffSec !== null ? `Designer emailed ${fmtDuration(m.medianHandoffSec)} after hang-up` : "The agent answers every call, 24×7"} tone="good" />
        <Stat label="Qualified leads" value={String(m.qualified)} sub={`${pct(m.qualifiedRate)} of ${m.leads} prospective projects`} href="/admin/calls?d=qualified" />
        <Stat label="Pipeline (estimate)" value={inrRange(m.pipelineLow, m.pipelineHigh)} sub={`${m.qualified} leads × ${pct(s.assumptions.qualified_to_project)} close × ₹${s.assumptions.avg_project_lakh_low}–${s.assumptions.avg_project_lakh_high}L`} href="/admin/money" />
        <Stat label="Cost to run" value={inr(m.cost.total)} sub={m.costPerQualified ? `${inr(m.costPerQualified)} per qualified lead · ${Math.round(roi).toLocaleString("en-IN")}× pipeline` : `${inr(m.costPerCall)} per call`} href="/admin/money" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <Card eyebrow="Where calls go" title="From ring to designer">
          <Funnel stages={[
            { label: "Calls in", value: m.enquiries },
            { label: "Answered by agent", value: m.answered, note: "Vaani answers 24×7" },
            { label: "Prospective projects", value: m.leads, note: "Excludes existing-client complaints and missed calls" },
            { label: "Qualified", value: m.qualified, note: "Passed qualified.md" },
            { label: "Emailed to designer", value: m.handedOff },
            { label: "Designer picked up", value: m.acknowledged, note: "Clicked Acknowledge" },
          ]} />
          <p className="mt-4 text-xs text-muted">
            {m.medianAckMin !== null ? <>Median designer pickup: <b className="text-ink-2">{Math.round(m.medianAckMin)} min</b> after the email. </> : null}
            Percentages are stage-to-stage.
          </p>
        </Card>

        <Card eyebrow="Outcome of every call" title="Decision mix">
          <SegmentBar parts={ORDER.map((d) => ({ key: d, label: DECISION_LABEL[d], value: m.decisions[d], color: DECISION_VAR[d], href: `/admin/calls?d=${d}` }))} />
          <p className="mt-4 text-xs text-muted">Qualified · notes = passed, with budget or decision-maker to confirm at the consultation (qualified.md §4–5).</p>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-[1fr_1fr_1.2fr]">
        <Card eyebrow="When they call" title="Calls by hour">
          <ClockDial byHour={m.byHour} afterShare={m.enquiries ? m.afterHours / m.enquiries : 0} />
          <p className="mt-3 text-center text-xs text-muted">
            {m.afterHours} of {m.enquiries} outside 10am–7pm{m.afterHoursQualified ? <> — <b className="text-ink-2">{m.afterHoursQualified} qualified</b> the front desk would have missed</> : null}.
          </p>
        </Card>

        <Card eyebrow="Closed gracefully" title="Why we said no">
          {m.declines.length ? (
            <BarList rows={m.declines.map((d) => ({ label: DECLINE_LABEL[d.reason], value: d.count }))} />
          ) : <Empty>No declines in this period.</Empty>}
          <p className="mt-4 text-xs text-muted">Price questions never count against a caller (qualified.md). {m.decisions.NURTURE ? `${m.decisions.NURTURE} kept warm for a later start.` : ""}</p>
        </Card>

        <Card eyebrow="Designer queue" title="Highest priority, not yet picked up" action={<Link href="/admin/calls?d=qualified" className="text-sm text-accent-ink hover:underline">All →</Link>}>
          {queue.length ? (
            <ul className="-mx-2 divide-y divide-line">
              {queue.map((r) => (
                <li key={r.call.id}>
                  <Link href={`/admin/calls/${r.call.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-surface-2">
                    <PriorityMeter value={r.assessment!.priority} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{projectLine(r)}</span>
                      <span className="block truncate text-xs text-muted">{callerName(r)} · {r.handoff?.designer_name ?? "—"} · sent {r.handoff?.sent_at ? fmtAgo(r.handoff.sent_at, t.getTime()) + " ago" : "—"}</span>
                    </span>
                    <Flags flags={flagsFor(r, records).filter((f) => f === "vip" || f === "repeat")} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <Empty>Every qualified lead has been picked up.</Empty>}
        </Card>
      </div>

      <Card eyebrow="Latest calls" title="What just happened" action={<Link href="/admin/calls" className="text-sm text-accent-ink hover:underline">All calls →</Link>}>
        <ul className="-mx-2 divide-y divide-line">
          {[...records].filter((r) => !r.call.merged_into).sort((a, b) => b.call.started_at.localeCompare(a.call.started_at)).slice(0, 6).map((r) => (
            <li key={r.call.id}>
              <Link href={`/admin/calls/${r.call.id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 rounded-lg px-2 py-2.5 hover:bg-surface-2 sm:grid-cols-[7.5rem_1fr_auto_auto]">
                <span className="text-xs text-muted tnum sm:text-sm">{fmtWhen(r.call.started_at)}</span>
                <span className="col-span-2 min-w-0 sm:col-span-1">
                  <span className="block truncate text-sm font-medium">{projectLine(r)}</span>
                  <span className="block truncate text-xs text-muted">{r.assessment?.decision_reasons[0]}</span>
                </span>
                <span className="hidden sm:block"><Pips criteria={r.assessment?.grading.criteria ?? null} /></span>
                <DecisionBadge d={effectiveDecision(r.assessment)} overridden={!!r.assessment?.override} />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

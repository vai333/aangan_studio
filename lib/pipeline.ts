// Pure: grading + call + settings → what should happen. No I/O here, so the
// live webhook job, the demo replay and the eval harness all run the same code.
import { costEventsForCall } from "./cost";
import { decide } from "./decision";
import { buildEscalationEmail, buildHandoffEmail, type HandoffEmail } from "./email/handoff";
import { buildCallReportEmail } from "./email/report";
import { scorePriority } from "./priority";
import { appUrl, signAck } from "./tokens";
import type { Assessment, Call, CostEvent, Designer, Escalation, Grading, Handoff, Settings } from "./types";

export interface Outcome {
  assessment: Assessment;
  handoff: (Handoff & { html: string }) | null;
  escalation: Escalation | null;
  escalationEmail: HandoffEmail | null;
  /** One per call, to settings.call_report_email — null only when that setting is blank. */
  report: (HandoffEmail & { to: string }) | null;
  costs: CostEvent[];
}

/** Least-loaded active designer for the segment (stateless round-robin). */
export function pickDesigner(segment: "residential" | "commercial" | null, s: Settings, loads: Record<string, number>): Designer {
  const pool = s.designers.filter((d) => d.active && d.segments.includes(segment ?? "residential"));
  const list = pool.length ? pool : s.designers.filter((d) => d.active);
  return [...list].sort((a, b) => (loads[a.email] ?? 0) - (loads[b.email] ?? 0) || a.name.localeCompare(b.name))[0];
}

export function buildOutcome(args: {
  call: Call; grading: Grading; settings: Settings; repeatCount: number; designerLoads: Record<string, number>;
  model: string; promptVersion: string; tokens?: { input: number; output: number }; ids: { assessment: string; handoff: string; escalation: string };
  nowIso: string;
}): Outcome {
  const { call, grading, settings: s, repeatCount, ids, nowIso } = args;
  if (repeatCount > 0) grading.flags.repeat_caller = true;

  const d = decide(grading, call.status, s);
  const p = scorePriority({ ...grading, criteria: d.criteria }, d.decision, repeatCount);

  const assessment: Assessment = {
    id: ids.assessment, call_id: call.id, grading: { ...grading, criteria: d.criteria },
    decision: d.decision, decision_reasons: d.reasons, decline_reason: d.decline_reason,
    priority: p.score, priority_reasons: p.reasons, model: args.model, prompt_version: args.promptVersion,
    rubric_version: s.rubric_version, created_at: nowIso, override: null,
  };

  const dashboardUrl = `${appUrl()}/admin/calls/${call.id}`;
  let handoff: Outcome["handoff"] = null;
  let escalation: Escalation | null = null;
  let escalationEmail: HandoffEmail | null = null;

  if (d.decision === "QUALIFIED" || d.decision === "QUALIFIED_WITH_NOTES") {
    const designer = s.routing === "single_inbox"
      ? { name: "Design team", email: s.leads_inbox, segments: [], active: true }
      : pickDesigner(grading.extracted.segment, s, args.designerLoads);
    const cc = [s.leads_inbox, ...(grading.flags.vip_referral ? [s.founder_email] : [])].filter((e) => e !== designer.email);
    const mail = buildHandoffEmail({
      call, grading, criteria: d.criteria, decision: d.decision, priority: p.score,
      designerName: designer.name, dashboardUrl, ackUrl: `${appUrl()}/ack/${signAck(ids.handoff)}`,
    });
    handoff = {
      id: ids.handoff, call_id: call.id, designer_name: designer.name, designer_email: designer.email, cc,
      subject: mail.subject, body_text: mail.text, html: mail.html, provider_message_id: null, status: "queued",
      sent_at: null, acknowledged_at: null,
    };
  }

  if (d.decision === "ESCALATION") {
    escalation = { id: ids.escalation, call_id: call.id, kind: "existing_client", reason: d.reasons[0], status: "open", created_at: nowIso, resolved_at: null };
    escalationEmail = buildEscalationEmail(call, grading, d.reasons[0], dashboardUrl);
  } else if (d.decision === "INCOMPLETE") {
    const frustrated = grading.flags.repeat_caller || grading.extracted.sentiment === "frustrated" || grading.extracted.sentiment === "angry";
    const onlyArea = d.criteria.service_area.verdict === "unclear" &&
      (["scope", "real_project", "timeline"] as const).every((k) => d.criteria[k].verdict !== "unclear");
    const kind: Escalation["kind"] = call.status === "missed" ? "callback" : frustrated ? "service_recovery" : onlyArea ? "area_review" : "callback";
    const reason = call.status === "missed" ? "Missed call — call back"
      : kind === "service_recovery" ? "Repeat, frustrated caller — senior callback today"
      : kind === "area_review" ? d.criteria.service_area.note ?? "Confirm service area"
      : d.reasons[0];
    escalation = { id: ids.escalation, call_id: call.id, kind, reason, status: "open", created_at: nowIso, resolved_at: null };
    if (kind === "service_recovery") escalationEmail = buildEscalationEmail(call, grading, reason, dashboardUrl);
  }

  const to = s.call_report_email.trim();
  // The report is the "something happened" email for calls that otherwise email nobody (declines, missed calls, callbacks).
  // When this address already receives the call's designer handoff (to or cc) or its escalation email, that email says it all,
  // and a second near-identical message would just look like a duplicate.
  const lower = (x: string) => x.trim().toLowerCase();
  const alreadyMailed = new Set<string>([
    ...(handoff ? [handoff.designer_email, ...handoff.cc] : []),
    ...(escalationEmail ? [s.escalation_email] : []),
  ].map(lower));
  const report = to && !alreadyMailed.has(lower(to))
    ? { to, ...buildCallReportEmail({ call, assessment, handoff, escalation, dashboardUrl }) }
    : null;

  const emails = (handoff ? 1 : 0) + (escalationEmail ? 1 : 0) + (report ? 1 : 0);
  const costs = costEventsForCall(call.id, call.duration_sec, nowIso, emails, s, args.tokens, call.status !== "missed");
  return { assessment, handoff, escalation, escalationEmail, report, costs };
}

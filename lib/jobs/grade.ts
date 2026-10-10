import "server-only";
import { randomUUID } from "node:crypto";
import { getSettings } from "../data/repo";
import { json, q, q1 } from "../db";
import { decide } from "../decision";
import { sendEmail } from "../email/send";
import { emptyGrading, gradeTranscript, PROMPT_VERSION, type GradeResult } from "../grading/gemini";
import { pushCallToHubspot } from "../hubspot/sync";
import { buildOutcome, type Outcome } from "../pipeline";
import { scorePriority } from "../priority";
import type { Call, Grading, Settings, TranscriptTurn } from "../types";

const MAX_ATTEMPTS = 3;

type Grader = (turns: TranscriptTurn[], ctx: { callDateIso: string; priorCalls: number; settings: Settings }) => Promise<GradeResult>;

async function designerLoads(): Promise<Record<string, number>> {
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const rows = await q("select designer_email, count(*)::int as n from handoffs where created_at >= $1 group by 1", [since]);
  return Object.fromEntries(rows.map((r) => [r.designer_email, r.n]));
}

/** Grade one call end to end. Safe to call twice: the claim step makes it single-flight. */
export async function gradeCall(callId: string, opts: { grader?: Grader } = {}): Promise<void> {
  const row = await q1(
    `update calls set grade_status = 'running', grade_attempts = grade_attempts + 1
      where id = $1 and grade_status in ('pending','failed') and grade_attempts < $2 returning *`, [callId, MAX_ATTEMPTS]);
  if (!row) return; // already graded, running elsewhere, or out of attempts

  try {
    if (row.merged_into) {
      await q("update calls set grade_status = 'skipped' where id = $1", [callId]);
      return;
    }
    const settings = await getSettings();
    const call: Call = {
      id: row.id, vaani_call_id: row.provider_call_id, caller_phone: row.caller_phone, started_at: row.started_at,
      answered_after_sec: row.answered_after_sec, duration_sec: row.duration_sec, status: row.status,
      transcript: row.transcript ?? [], recording_url: row.recording_url, merged_into: null,
    };

    // T17: a dropped call merged into this one — grade the whole conversation.
    const merged = await q("select transcript from calls where merged_into = $1 order by started_at", [callId]);
    const fullTranscript: TranscriptTurn[] = [...merged.flatMap((m) => m.transcript ?? []), ...call.transcript];

    const since = new Date(new Date(call.started_at).getTime() - 30 * 864e5).toISOString();
    const priorRow = await q1(
      "select count(*)::int as n from calls where caller_phone = $1 and started_at < $2 and started_at >= $3 and merged_into is null and caller_phone <> 'unknown'",
      [call.caller_phone, call.started_at, since]);
    const prior = priorRow?.n ?? 0;

    let model = "none", tokens = { input: 0, output: 0 };
    let grading: Grading = emptyGrading();
    if (call.status !== "missed") {
      const g = await (opts.grader ?? gradeTranscript)(fullTranscript, { callDateIso: call.started_at, priorCalls: prior, settings });
      grading = g.grading; model = g.model; tokens = { input: g.inputTokens, output: g.outputTokens };
    }

    const out = buildOutcome({
      call, grading, settings, repeatCount: prior, designerLoads: await designerLoads(),
      model, promptVersion: PROMPT_VERSION, tokens, nowIso: new Date().toISOString(),
      ids: { assessment: randomUUID(), handoff: randomUUID(), escalation: randomUUID() },
    });
    await persistAndNotify(call, out, settings, tokens);
    await q("update calls set grade_status = 'done', last_error = null where id = $1", [callId]);
    // The founder's HubSpot view: never allowed to fail the call itself; the sweep retries.
    await pushCallToHubspot(callId).catch((e) => console.error("hubspot push failed", callId, e));
  } catch (e) {
    const attempts = row.grade_attempts as number;
    await q("update calls set grade_status = 'failed', last_error = $2 where id = $1", [callId, String(e).slice(0, 500)]);
    if (attempts >= MAX_ATTEMPTS) {
      // Never lose a caller: after the last retry, a human gets it.
      await q(
        `insert into escalations (call_id, kind, reason) values ($1, 'callback', $2) on conflict (call_id, kind) do nothing`,
        [callId, `Automatic grading failed ${attempts}× — review the transcript and call back`]);
    }
    throw e;
  }
}

async function persistAndNotify(call: Call, out: Outcome, s: Settings, tokens: { input: number; output: number }) {
  const a = out.assessment;
  await q("update assessments set is_current = false where call_id = $1 and is_current", [call.id]);
  const v = await q1("select count(*)::int as n from assessments where call_id = $1", [call.id]);
  await q(
    `insert into assessments (id, call_id, version, is_current, grading, decision, decision_reasons, decline_reason, priority, priority_reasons, model, prompt_version, rubric_version, input_tokens, output_tokens)
     values ($1,$2,$3,true,$4::jsonb,$5,$6::jsonb,$7,$8,$9::jsonb,$10,$11,$12,$13,$14)`,
    [a.id, call.id, (v?.n ?? 0) + 1, json(a.grading), a.decision, json(a.decision_reasons), a.decline_reason, a.priority, json(a.priority_reasons), a.model, a.prompt_version, a.rubric_version, tokens.input, tokens.output]);
  for (const c of out.costs) {
    await q("insert into cost_events (call_id, provider, units, unit, amount_inr, at) values ($1,$2,$3,$4,$5,$6)", [call.id, c.provider, c.units, c.unit, c.amount_inr, c.at]);
  }

  if (out.escalation) {
    await q("insert into escalations (id, call_id, kind, reason) values ($1,$2,$3,$4) on conflict (call_id, kind) do nothing", [out.escalation.id, call.id, out.escalation.kind, out.escalation.reason]);
  }
  if (out.escalationEmail) {
    await sendEmail({ to: s.escalation_email, subject: out.escalationEmail.subject, text: out.escalationEmail.text, html: out.escalationEmail.html, idempotencyKey: `esc-${call.id}` });
  }

  // Report goes out for every call, whatever the decision. unique(call_id) means a
  // duplicate run (webhook retry + sweep) can't send it twice.
  if (out.report) {
    const r = out.report;
    const row = await q1(
      `insert into call_reports (call_id, to_email, subject, body_text, body_html, status) values ($1,$2,$3,$4,$5,'queued')
       on conflict (call_id) do nothing returning id`, [call.id, r.to, r.subject, r.text, r.html]);
    if (row) await deliverReport(row.id).catch((e) => console.error("report failed", call.id, e));
  }

  if (out.handoff) {
    const h = out.handoff;
    const row = await q1(
      `insert into handoffs (id, call_id, designer_name, designer_email, cc, subject, body_text, body_html, status) values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,'queued')
       on conflict (call_id) do nothing returning id`,
      [h.id, call.id, h.designer_name, h.designer_email, json(h.cc), h.subject, h.body_text, h.html]);
    if (row) await deliverHandoff(row.id); // unique(call_id) → a duplicate run can't double-send
  }
}

export async function deliverHandoff(handoffId: string): Promise<void> {
  const h = await q1("select * from handoffs where id = $1", [handoffId]);
  if (!h || h.status === "sent") return;
  const res = await sendEmail({ to: h.designer_email, cc: h.cc ?? [], subject: h.subject, text: h.body_text, html: h.body_html, idempotencyKey: `handoff-${h.id}` });
  if (res.ok) await q("update handoffs set status = 'sent', provider_message_id = $2, sent_at = now(), attempts = attempts + 1, last_error = null where id = $1", [h.id, res.id]);
  else await q("update handoffs set status = 'failed', attempts = attempts + 1, last_error = $2 where id = $1", [h.id, res.error]);
}

export async function deliverReport(reportId: string): Promise<void> {
  const r = await q1("select * from call_reports where id = $1", [reportId]);
  if (!r || r.status === "sent") return;
  const res = await sendEmail({ to: r.to_email, subject: r.subject, text: r.body_text, html: r.body_html, idempotencyKey: `report-${r.call_id}` });
  if (res.ok) await q("update call_reports set status = 'sent', provider_message_id = $2, sent_at = now(), attempts = attempts + 1, last_error = null where id = $1", [r.id, res.id]);
  else await q("update call_reports set status = 'failed', attempts = attempts + 1, last_error = $2 where id = $1", [r.id, res.error]);
}

/** Re-apply the deterministic rules with today's settings (e.g. after adding an area). */
export async function redecideCall(callId: string): Promise<void> {
  const call = await q1("select * from calls where id = $1", [callId]);
  const a = await q1("select * from assessments where call_id = $1 and is_current", [callId]);
  if (!call || !a) return;
  const s = await getSettings();
  const d = decide(a.grading, call.status, s);
  const p = scorePriority({ ...a.grading, criteria: d.criteria }, d.decision, 0);
  if (d.decision === a.decision) return;

  const c: Call = { id: call.id, vaani_call_id: call.provider_call_id, caller_phone: call.caller_phone, started_at: call.started_at, answered_after_sec: call.answered_after_sec, duration_sec: call.duration_sec, status: call.status, transcript: call.transcript ?? [], recording_url: call.recording_url, merged_into: null };
  const out = buildOutcome({
    call: c, grading: a.grading, settings: s, repeatCount: 0, designerLoads: await designerLoads(), model: a.model,
    promptVersion: a.prompt_version, nowIso: new Date().toISOString(), tokens: { input: 0, output: 0 },
    ids: { assessment: randomUUID(), handoff: randomUUID(), escalation: randomUUID() },
  });
  out.assessment.priority = p.score;
  out.assessment.decision_reasons = [...d.reasons, `Re-decided after a settings change (was ${a.decision}).`];
  out.costs = [];
  out.report = null; // already reported when the call was first graded
  await persistAndNotify(c, out, s, { input: 0, output: 0 });
  if (d.decision !== "INCOMPLETE") {
    await q("update escalations set status = 'resolved', resolved_at = now(), resolved_by = 're-decide' where call_id = $1 and kind = 'area_review' and status = 'open'", [callId]);
  }
}

import "server-only";
import { getSessionEmail, readSession } from "../auth";
import { dbConfigured, json, q, q1, type Row } from "../db";
import { DEFAULT_SETTINGS } from "../settings-defaults";
import type { Assessment, Call, CallRecord, CallReport, CostEvent, Decision, Escalation, Handoff, HubspotSync, Settings } from "../types";
import { demoDb, demoNow, demoOps, demoRecords } from "./demo";

export type Mode = "demo" | "live";
export const mode = (): Mode => (dbConfigured() ? "live" : "demo");

/** Dashboard clock. In demo mode it sits at the end of the September replay. */
export const now = (): Date => (mode() === "demo" ? demoNow() : new Date());

export function mergeSettings(data: Partial<Settings> | null | undefined): Settings {
  const d = structuredClone(DEFAULT_SETTINGS);
  if (!data) return d;
  return {
    ...d, ...data,
    policy: { ...d.policy, ...data.policy },
    hubspot: { ...d.hubspot, ...data.hubspot },
    prices: { ...d.prices, ...data.prices, fixed_inr_per_month: { ...d.prices.fixed_inr_per_month, ...data.prices?.fixed_inr_per_month } },
    assumptions: { ...d.assumptions, ...data.assumptions },
  };
}

// ── Reads ───────────────────────────────────────────────────────────
function rowToCall(r: Row): Call {
  return {
    id: r.id, vaani_call_id: r.provider_call_id, caller_phone: r.caller_phone, started_at: r.started_at,
    answered_after_sec: r.answered_after_sec, duration_sec: r.duration_sec, status: r.status,
    transcript: r.transcript ?? [], recording_url: r.recording_url, merged_into: r.merged_into,
  };
}

export async function listRecords(sinceDays = 400): Promise<CallRecord[]> {
  if (mode() === "demo") return demoRecords();
  const since = new Date(Date.now() - sinceDays * 864e5).toISOString();
  const calls = await q(
    `select id, provider_call_id, caller_phone, started_at, answered_after_sec, duration_sec, status, transcript, recording_url, merged_into
       from calls where started_at >= $1 order by started_at desc`, [since]);
  if (!calls.length) return [];
  const inRange = "call_id in (select id from calls where started_at >= $1)";
  const [assessments, handoffs, reports, escalations, costs, hubspots] = await Promise.all([
    q(`select * from assessments where is_current and ${inRange}`, [since]),
    q(`select * from handoffs where ${inRange}`, [since]),
    q(`select * from call_reports where ${inRange}`, [since]),
    q(`select * from escalations where ${inRange}`, [since]),
    q(`select * from cost_events where ${inRange}`, [since]),
    q(`select * from hubspot_syncs where ${inRange}`, [since]),
  ]);

  const by = <T extends Row>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) (m.get(r.call_id) ?? m.set(r.call_id, []).get(r.call_id)!).push(r);
    return m;
  };
  const A = by(assessments), H = by(handoffs), R = by(reports), E = by(escalations), C = by(costs), X = by(hubspots);

  const base = calls.map((row) => {
    const call = rowToCall(row);
    const a = A.get(call.id)?.[0];
    const assessment: Assessment | null = a ? {
      id: a.id, call_id: a.call_id, grading: a.grading, decision: a.decision, decision_reasons: a.decision_reasons ?? [],
      decline_reason: a.decline_reason, priority: a.priority, priority_reasons: a.priority_reasons ?? [], model: a.model,
      prompt_version: a.prompt_version, rubric_version: a.rubric_version, created_at: a.created_at, override: a.override,
    } : null;
    const h = H.get(call.id)?.[0];
    const handoff: Handoff | null = h ? {
      id: h.id, call_id: h.call_id, designer_name: h.designer_name, designer_email: h.designer_email, cc: h.cc ?? [],
      subject: h.subject, body_text: h.body_text, provider_message_id: h.provider_message_id, status: h.status,
      sent_at: h.sent_at, acknowledged_at: h.acknowledged_at,
    } : null;
    const rp = R.get(call.id)?.[0];
    const report: CallReport | null = rp ? { id: rp.id, call_id: rp.call_id, to_email: rp.to_email, subject: rp.subject, body_text: rp.body_text, provider_message_id: rp.provider_message_id, status: rp.status, sent_at: rp.sent_at } : null;
    const es = E.get(call.id) ?? [];
    const e = es.find((x) => x.status === "open") ?? es[0];
    const escalation: Escalation | null = e ? { id: e.id, call_id: e.call_id, kind: e.kind, reason: e.reason, status: e.status, created_at: e.created_at, resolved_at: e.resolved_at } : null;
    const costsOut: CostEvent[] = (C.get(call.id) ?? []).map((c) => ({ call_id: c.call_id, provider: c.provider, units: Number(c.units), unit: c.unit, amount_inr: Number(c.amount_inr), at: c.at }));
    const x = X.get(call.id)?.[0];
    const hubspot: HubspotSync | null = x ? { call_id: x.call_id, contact_id: x.contact_id, deal_id: x.deal_id, note_id: x.note_id, portal_id: x.portal_id, ui_domain: x.ui_domain ?? null, status: x.status, attempts: x.attempts, last_error: x.last_error, synced_at: x.synced_at } : null;
    return { call, assessment, handoff, report, hubspot, escalation, costs: costsOut };
  });

  return base.map((r) => ({
    ...r,
    repeatCount: base.filter((o) => o.call.caller_phone === r.call.caller_phone && r.call.caller_phone !== "unknown" && o.call.started_at < r.call.started_at).length,
  }));
}

export async function getRecord(id: string): Promise<CallRecord | null> {
  return (await listRecords()).find((r) => r.call.id === id) ?? null;
}

export async function getSettings(): Promise<Settings> {
  if (mode() === "demo") return demoDb().settings;
  const row = await q1("select data from settings where id = 1");
  const s = mergeSettings(row?.data);
  if (!row?.data?.call_report_email && process.env.CALL_REPORT_EMAIL) s.call_report_email = process.env.CALL_REPORT_EMAIL;
  return s;
}

// ── Auth ────────────────────────────────────────────────────────────
export async function currentUserEmail(): Promise<string> {
  if (mode() === "demo") return "demo@aangan.studio";
  return (await getSessionEmail()) ?? "unknown";
}

export async function requireAdmin(): Promise<void> {
  if (mode() === "demo") return;
  if (!(await getSessionEmail())) throw new Error("Not signed in");
}

export { readSession };

// ── Writes (admin actions) ─────────────────────────────────────────
export async function overrideDecision(callId: string, decision: Decision, reason: string): Promise<void> {
  const by = await currentUserEmail();
  if (mode() === "demo") return demoOps.override(callId, decision, reason, by);
  const a = await q1("select id, decision, override from assessments where call_id = $1 and is_current", [callId]);
  if (!a) throw new Error("No assessment for this call");
  await q("update assessments set override = $2::jsonb where id = $1", [a.id, json({ decision, reason, by, at: new Date().toISOString() })]);
  await q("insert into overrides (assessment_id, call_id, from_decision, to_decision, reason, by_email) values ($1,$2,$3,$4,$5,$6)",
    [a.id, callId, a.override?.decision ?? a.decision, decision, reason, by]);
}

export async function clearOverride(callId: string): Promise<void> {
  if (mode() === "demo") return demoOps.clearOverride(callId);
  await q("update assessments set override = null where call_id = $1 and is_current", [callId]);
}

export async function resolveEscalation(id: string): Promise<void> {
  if (mode() === "demo") return demoOps.resolve(id);
  await q("update escalations set status = 'resolved', resolved_at = now(), resolved_by = $2 where id = $1", [id, await currentUserEmail()]);
}

export async function saveSettings(s: Settings): Promise<void> {
  if (mode() === "demo") return demoOps.saveSettings(s);
  await q("insert into settings (id, data, updated_by) values (1, $1::jsonb, $2) on conflict (id) do update set data = excluded.data, updated_at = now(), updated_by = excluded.updated_by",
    [json(s), await currentUserEmail()]);
}

/** Designer acknowledgement via signed link — designers aren't admins, so the token is the auth. */
export async function acknowledgeHandoff(handoffId: string): Promise<boolean> {
  if (mode() === "demo") { demoOps.acknowledge(handoffId); return true; }
  await q("update handoffs set acknowledged_at = now() where id = $1 and acknowledged_at is null", [handoffId]);
  return true;
}

export async function getHandoffForAck(handoffId: string): Promise<Pick<Handoff, "id" | "subject" | "designer_name" | "acknowledged_at"> | null> {
  if (mode() === "demo") {
    for (const h of demoDb().handoffs.values()) if (h.id === handoffId) return h;
    return null;
  }
  if (!/^[0-9a-f-]{36}$/i.test(handoffId)) return null;
  return (await q1("select id, subject, designer_name, acknowledged_at from handoffs where id = $1", [handoffId])) as never;
}

export async function redecide(callId: string): Promise<void> {
  await requireAdmin();
  if (mode() === "demo") return demoOps.redecide(callId);
  const { redecideCall } = await import("../jobs/grade");
  await redecideCall(callId);
}

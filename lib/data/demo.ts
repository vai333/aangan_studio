// In-memory store used when DATABASE_URL isn't set. It replays the
// September transcripts through the real pipeline, so the dashboard shows
// exactly what production code would produce. Changes live until restart.
import { DEMO_NOW, SEPTEMBER } from "../demo/september";
import { decide } from "../decision";
import { emptyGradingPure } from "../grading/empty";
import { buildOutcome } from "../pipeline";
import { scorePriority } from "../priority";
import { DEFAULT_SETTINGS } from "../settings-defaults";
import type { Assessment, Call, CallRecord, CallReport, CostEvent, Decision, Escalation, Handoff, Settings } from "../types";

interface DemoDB {
  settings: Settings;
  calls: Call[];
  assessments: Map<string, Assessment>;
  handoffs: Map<string, Handoff & { html?: string }>;
  escalations: Map<string, Escalation>;
  reports: Map<string, CallReport>;
  costs: CostEvent[];
}

const addSec = (iso: string, sec: number) => new Date(new Date(iso).getTime() + sec * 1000).toISOString();

function build(): DemoDB {
  const settings: Settings = structuredClone(DEFAULT_SETTINGS);
  const db: DemoDB = { settings, calls: [], assessments: new Map(), handoffs: new Map(), escalations: new Map(), reports: new Map(), costs: [] };
  const loads: Record<string, number> = {};
  const idOf = (label: string) => `demo-${label.toLowerCase()}`;

  for (const seed of SEPTEMBER) {
    const call: Call = {
      id: idOf(seed.label), vaani_call_id: `vaani-${seed.label}`, caller_phone: seed.phone, started_at: new Date(seed.started_at).toISOString(),
      answered_after_sec: seed.status === "missed" ? null : 3, duration_sec: seed.duration_sec, status: seed.status,
      transcript: seed.transcript, recording_url: null, merged_into: seed.merged_into ? idOf(seed.merged_into) : null, source_label: seed.label,
    };
    db.calls.push(call);
    if (call.merged_into) {
      db.costs.push({ call_id: call.id, provider: "vaani", units: +(call.duration_sec / 60).toFixed(2), unit: "min", amount_inr: (call.duration_sec / 60) * settings.prices.vaani_inr_per_min, at: call.started_at });
      continue;
    }
    const prior = db.calls.filter((c) => c.caller_phone === call.caller_phone && c.id !== call.id && !c.merged_into).length;
    const end = addSec(call.started_at, call.duration_sec);
    const out = buildOutcome({
      call, grading: structuredClone(seed.grading ?? emptyGradingPure()), settings, repeatCount: prior, designerLoads: loads,
      model: "golden-label (demo)", promptVersion: "grader-v1.0", ids: { assessment: `a-${call.id}`, handoff: `h-${call.id}`, escalation: `e-${call.id}` },
      nowIso: addSec(end, 20),
    });
    db.assessments.set(call.id, out.assessment);
    db.costs.push(...out.costs);
    if (out.report) {
      db.reports.set(call.id, {
        id: `r-${call.id}`, call_id: call.id, to_email: out.report.to, subject: out.report.subject, body_text: out.report.text,
        provider_message_id: `demo-report-${call.id}`, status: "sent", sent_at: addSec(end, 25),
      });
    }
    if (out.handoff) {
      loads[out.handoff.designer_email] = (loads[out.handoff.designer_email] ?? 0) + 1;
      const sent = addSec(end, 48 + (call.duration_sec % 30));
      db.handoffs.set(call.id, {
        ...out.handoff, status: "sent", sent_at: sent, provider_message_id: `demo-${call.id}`,
        acknowledged_at: seed.ack_after_min == null ? null : addSec(sent, seed.ack_after_min * 60),
      });
    }
    if (out.escalation) {
      const resolved = out.escalation.kind === "existing_client";
      db.escalations.set(call.id, { ...out.escalation, status: resolved ? "resolved" : "open", resolved_at: resolved ? addSec(end, 12 * 60) : null });
    }
  }
  return db;
}

const g = globalThis as unknown as { __aanganDemo?: DemoDB };
export const demoDb = (): DemoDB => {
  // Rebuild if the cached store predates the current shape (dev hot-reload).
  if (!g.__aanganDemo || !g.__aanganDemo.reports) g.__aanganDemo = build();
  return g.__aanganDemo;
};
export const demoNow = () => new Date(DEMO_NOW);

export function demoRecords(): CallRecord[] {
  const db = demoDb();
  return db.calls.map((call) => ({
    call,
    assessment: db.assessments.get(call.id) ?? null,
    handoff: db.handoffs.get(call.id) ?? null,
    report: db.reports.get(call.id) ?? null,
    hubspot: null,
    escalation: db.escalations.get(call.id) ?? null,
    costs: db.costs.filter((c) => c.call_id === call.id),
    repeatCount: db.calls.filter((c) => c.caller_phone === call.caller_phone && c.started_at < call.started_at).length,
  }));
}

export const demoOps = {
  override(callId: string, decision: Decision, reason: string, by: string) {
    const a = demoDb().assessments.get(callId);
    if (a) a.override = { decision, reason, by, at: new Date().toISOString() };
  },
  clearOverride(callId: string) {
    const a = demoDb().assessments.get(callId);
    if (a) a.override = null;
  },
  acknowledge(handoffId: string) {
    for (const h of demoDb().handoffs.values()) if (h.id === handoffId && !h.acknowledged_at) h.acknowledged_at = new Date().toISOString();
  },
  resolve(escalationId: string) {
    for (const e of demoDb().escalations.values()) if (e.id === escalationId) { e.status = "resolved"; e.resolved_at = new Date().toISOString(); }
  },
  saveSettings(s: Settings) {
    demoDb().settings = s;
  },
  /** Re-run the deterministic decision with current settings (e.g. after adding an area). */
  redecide(callId: string) {
    const db = demoDb();
    const a = db.assessments.get(callId);
    const call = db.calls.find((c) => c.id === callId);
    if (!a || !call) return;
    const d = decide(a.grading, call.status, db.settings);
    const p = scorePriority({ ...a.grading, criteria: d.criteria }, d.decision, 0);
    db.assessments.set(callId, { ...a, grading: { ...a.grading, criteria: d.criteria }, decision: d.decision, decision_reasons: d.reasons, decline_reason: d.decline_reason, priority: p.score, priority_reasons: p.reasons, rubric_version: db.settings.rubric_version });
    if (d.decision !== "INCOMPLETE") {
      const e = db.escalations.get(callId);
      if (e && e.kind === "area_review") { e.status = "resolved"; e.resolved_at = new Date().toISOString(); }
    }
  },
};

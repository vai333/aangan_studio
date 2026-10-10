import "server-only";
import { getSettings } from "../data/repo";
import { json, q, q1 } from "../db";
import { fmtSqft } from "../format";
import { appUrl } from "../tokens";
import { CRITERION_LABEL, DECISION_LABEL, RUBRIC_KEYS, effectiveDecision, type Assessment, type Call, type Decision, type Settings } from "../types";
import { hs, hubspotConfigured, HubspotError } from "./client";

// HubSpot is the founder's whole-business view: every caller becomes a contact (deduped by phone),
// every call a timeline note, every real lead a deal. The studio never quotes prices, so no deal
// amount is ever set. One row per call in hubspot_syncs makes every step idempotent.
const ASSOC = { dealToContact: 3, noteToContact: 202, noteToDeal: 214 } as const; // HUBSPOT_DEFINED, from HubSpot's docs

const LEAD_STATUS: Partial<Record<Decision, string>> = {
  QUALIFIED: "OPEN", QUALIFIED_WITH_NOTES: "OPEN", NURTURE: "BAD_TIMING", NOT_QUALIFIED: "UNQUALIFIED", INCOMPLETE: "NEW",
};
const wantsDeal = (d: Decision) => d === "QUALIFIED" || d === "QUALIFIED_WITH_NOTES" || d === "NURTURE";
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

let portalCache: { portalId: string; uiDomain: string | null } | null = null;
async function portalInfo(): Promise<{ portalId: string | null; uiDomain: string | null }> {
  if (process.env.HUBSPOT_PORTAL_ID) return { portalId: process.env.HUBSPOT_PORTAL_ID, uiDomain: process.env.HUBSPOT_UI_DOMAIN ?? null };
  if (portalCache) return portalCache;
  try {
    const d = await hs<{ portalId: number; uiDomain?: string }>("GET", "/account-info/v3/details");
    portalCache = { portalId: String(d.portalId), uiDomain: d.uiDomain ?? null };
    return portalCache;
  } catch { return { portalId: null, uiDomain: null }; } // links just won't render
}

function noteHtml(call: Call, a: Assessment, decision: Decision): string {
  const g = a.grading, x = g.extracted;
  const rows: [string, string | null][] = [
    ["Locality", x.locality], ["Property", [x.bhk ? `${x.bhk}BHK` : null, x.carpet_sqft ? fmtSqft(x.carpet_sqft) : null].filter(Boolean).join(" · ") || null],
    ["Rooms", x.rooms_in_scope.join(", ") || null], ["Current state", x.current_state], ["Timeline", x.timeline_text],
    ["Decision-maker", x.decision_maker_status], ["Budget (volunteered)", x.budget_volunteered], ["Found us via", x.referral_source],
    ["Preferred consult", x.preferred_consult_slot],
  ];
  const transcript = call.transcript.map((t) => `<b>${t.speaker === "agent" ? "Aangan" : "Caller"}:</b> ${esc(t.text)}`).join("<br>").slice(0, 40_000);
  return [
    `<p><b>Call ${new Date(call.started_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} · ${call.status === "missed" ? "missed" : Math.round(call.duration_sec / 60 * 10) / 10 + " min"} · ${call.caller_phone === "unknown" ? "no phone number (web call)" : esc(call.caller_phone)}</b></p>`,
    `<p><b>Outcome: ${DECISION_LABEL[decision]}</b>${decision === "QUALIFIED" || decision === "QUALIFIED_WITH_NOTES" ? ` · priority ${a.priority}/100` : ""}<br>${a.decision_reasons.map(esc).join("<br>")}</p>`,
    `<p>${esc(g.summary)}</p>`,
    call.status !== "missed" && decision !== "ESCALATION"
      ? `<p><b>The gate</b><br>${RUBRIC_KEYS.map((k) => { const j = g.criteria[k]; return `${j.verdict === "pass" ? "✓" : j.verdict === "fail" ? "✗" : "?"} ${CRITERION_LABEL[k]}${j.evidence ? ` — “${esc(j.evidence)}”` : ""}`; }).join("<br>")}</p>` : "",
    rows.filter(([, v]) => v).length ? `<p><b>Captured</b><br>${rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${esc(v!)}`).join("<br>")}</p>` : "",
    `<p><a href="${appUrl()}/admin/calls/${call.id}">Open in Aangan dashboard</a></p>`,
    transcript ? `<p><b>Transcript</b><br>${transcript}</p>` : "",
    `<p><i>No price was quoted on this call.</i></p>`,
  ].join("");
}

function dealName(a: Assessment, call: Call): string {
  const x = a.grading.extracted;
  const what = x.bhk ? `${x.bhk}BHK` : x.property_type === "villa" ? "Villa" : x.segment === "commercial" ? "Office" : "Home";
  const bits = [what, x.locality, x.carpet_sqft ? fmtSqft(x.carpet_sqft) : null].filter(Boolean).join(" · ");
  return `[P${a.priority}] ${bits} — ${x.name ?? call.caller_phone}`;
}

async function findContactByPhone(phone: string): Promise<string | null> {
  const r = await hs<{ results: { id: string }[] }>("POST", "/crm/v3/objects/contacts/search", {
    filterGroups: [{ filters: [{ propertyName: "phone", operator: "EQ", value: phone }] }], properties: ["phone", "firstname"], limit: 1,
  });
  return r.results?.[0]?.id ?? null;
}

export type PushResult = { status: "synced" | "skipped" | "failed" | "disabled"; reason?: string };

export async function pushCallToHubspot(callId: string): Promise<PushResult> {
  const settings: Settings = await getSettings();
  if (!hubspotConfigured() || !settings.hubspot.enabled) return { status: "disabled" };

  const call = await q1("select * from calls where id = $1", [callId]);
  const a = await q1("select * from assessments where call_id = $1 and is_current", [callId]);
  if (!call || !a) return { status: "skipped", reason: "not graded yet" };
  const row = await q1("select * from hubspot_syncs where call_id = $1", [callId]);
  const save = (p: Partial<Record<string, unknown>> & { status: string }) => q(
    `insert into hubspot_syncs (call_id, contact_id, deal_id, note_id, portal_id, last_decision, status, attempts, last_error, synced_at, ui_domain, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
     on conflict (call_id) do update set contact_id = excluded.contact_id, deal_id = excluded.deal_id, note_id = excluded.note_id, portal_id = excluded.portal_id, ui_domain = coalesce(excluded.ui_domain, hubspot_syncs.ui_domain),
       last_decision = excluded.last_decision, status = excluded.status, attempts = excluded.attempts, last_error = excluded.last_error, synced_at = excluded.synced_at, updated_at = now()`,
    [callId, p.contact_id ?? row?.contact_id ?? null, p.deal_id ?? row?.deal_id ?? null, p.note_id ?? row?.note_id ?? null, p.portal_id ?? row?.portal_id ?? null,
      p.last_decision ?? row?.last_decision ?? null, p.status, p.attempts ?? row?.attempts ?? 0, p.last_error ?? null, p.status === "synced" ? new Date().toISOString() : row?.synced_at ?? null, p.ui_domain ?? row?.ui_domain ?? null]);

  if (call.merged_into) { await save({ status: "skipped", last_error: "merged into a later call" }); return { status: "skipped", reason: "merged" }; }
  // A caller with no number (a website / browser call) is still a lead worth seeing: mirror it by name.
  // With neither a number nor a conversation there is nothing worth putting in a CRM.
  const noPhone = call.caller_phone === "unknown";
  if (noPhone && !(call.transcript ?? []).length) { await save({ status: "skipped", last_error: "no phone number and no conversation" }); return { status: "skipped", reason: "nothing to record" }; }

  const asm: Assessment = {
    id: a.id, call_id: a.call_id, grading: a.grading, decision: a.decision, decision_reasons: a.decision_reasons ?? [], decline_reason: a.decline_reason,
    priority: a.priority, priority_reasons: a.priority_reasons ?? [], model: a.model, prompt_version: a.prompt_version, rubric_version: a.rubric_version, created_at: a.created_at, override: a.override,
  };
  const decision = effectiveDecision(asm)!;
  const c: Call = { id: call.id, vaani_call_id: call.provider_call_id, caller_phone: call.caller_phone, started_at: call.started_at, answered_after_sec: call.answered_after_sec, duration_sec: call.duration_sec, status: call.status, transcript: call.transcript ?? [], recording_url: call.recording_url, merged_into: null };
  const x = asm.grading.extracted;

  let contactId: string | null = row?.contact_id ?? null, dealId: string | null = row?.deal_id ?? null, noteId: string | null = row?.note_id ?? null;
  try {
    // ── contact (deduped by phone; repeat callers reuse theirs) ──
    const [first, ...rest] = (x.name ?? "").trim().split(/\s+/);
    const props: Record<string, string> = noPhone ? {} : { phone: call.caller_phone };
    if (first) props.firstname = first;
    if (rest.length) props.lastname = rest.join(" ");
    // HubSpot needs a name, email or phone to create a contact
    if (noPhone && !first) props.lastname = `Web caller ${new Date(call.started_at).toISOString().slice(0, 10)}`;
    if (x.locality) props.city = x.locality;
    const status = LEAD_STATUS[decision];
    if (status) props.hs_lead_status = status;

    const upsertContact = async (p: Record<string, string>) => {
      if (!contactId && !noPhone) contactId = await findContactByPhone(call.caller_phone); // no number, so no dedupe: one contact per call
      if (contactId) await hs("PATCH", `/crm/v3/objects/contacts/${contactId}`, { properties: p });
      else contactId = (await hs<{ id: string }>("POST", "/crm/v3/objects/contacts", { properties: p })).id;
    };
    try { await upsertContact(props); }
    catch (e) {
      // an account can restrict hs_lead_status options; never lose the contact over an optional field
      if (e instanceof HubspotError && e.status === 400 && props.hs_lead_status) { delete props.hs_lead_status; await upsertContact(props); } else throw e;
    }

    // ── deal (real leads only; no amount — the studio never quotes) ──
    const stage = decision === "NURTURE" ? settings.hubspot.stage_nurture : settings.hubspot.stage_new;
    if (wantsDeal(decision)) {
      if (dealId) await hs("PATCH", `/crm/v3/objects/deals/${dealId}`, { properties: { dealname: dealName(asm, c), dealstage: stage, pipeline: settings.hubspot.pipeline_id } });
      else dealId = (await hs<{ id: string }>("POST", "/crm/v3/objects/deals", {
        properties: { dealname: dealName(asm, c), pipeline: settings.hubspot.pipeline_id, dealstage: stage },
        associations: [{ to: { id: contactId! }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: ASSOC.dealToContact }] }],
      })).id;
    } else if (dealId && row?.last_decision && wantsDeal(row.last_decision)) {
      // decision overridden from a real lead to a decline: close the deal rather than delete history
      await hs("PATCH", `/crm/v3/objects/deals/${dealId}`, { properties: { dealstage: settings.hubspot.stage_lost } });
    }

    // ── timeline note, once per call (on the contact, and the deal when there is one) ──
    if (!noteId) {
      const associations: { to: { id: string }; types: { associationCategory: string; associationTypeId: number }[] }[] = [{ to: { id: contactId! }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: ASSOC.noteToContact }] }];
      if (dealId) associations.push({ to: { id: dealId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: ASSOC.noteToDeal }] });
      noteId = (await hs<{ id: string }>("POST", "/crm/v3/objects/notes", {
        properties: { hs_timestamp: new Date(call.started_at).toISOString(), hs_note_body: noteHtml(c, asm, decision) }, associations,
      })).id;
    }

    const portal = await portalInfo();
    await save({ status: "synced", contact_id: contactId, deal_id: dealId, note_id: noteId, portal_id: portal.portalId, ui_domain: portal.uiDomain, last_decision: decision, attempts: (row?.attempts ?? 0) + 1 });
    return { status: "synced" };
  } catch (e) {
    // keep whatever was created so a retry continues instead of duplicating
    await save({ status: "failed", contact_id: contactId, deal_id: dealId, note_id: noteId, attempts: (row?.attempts ?? 0) + 1, last_error: String(e).slice(0, 400) });
    return { status: "failed", reason: String(e).slice(0, 200) };
  }
}

/** Calls graded but not yet mirrored (or failed < 5 times). Used by the sweep and the backfill button. */
export async function callsNeedingHubspot(limit = 25): Promise<string[]> {
  const rows = await q(
    `select c.id from calls c
       join assessments a on a.call_id = c.id and a.is_current
       left join hubspot_syncs h on h.call_id = c.id
      where c.grade_status = 'done' and c.merged_into is null and (c.caller_phone <> 'unknown' or jsonb_array_length(c.transcript) > 0)
        and (h.call_id is null or (h.status = 'failed' and h.attempts < 5))
      order by c.started_at desc limit $1`, [limit]);
  return rows.map((r) => r.id);
}

export { json };

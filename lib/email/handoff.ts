// The designer handoff email. Designed against one question from the senior
// designer on the panel: "If I got this at 9pm, could I walk into the
// consultation without re-asking anything?"
import { CRITERION_LABEL, RUBRIC_KEYS, type Call, type CriterionKey, type Decision, type Grading, type Judgement } from "../types";
import { fmtSqft, monthFromText, monthLabel } from "../format";

export const MARK: Record<string, string> = { pass: "✓", unclear: "?", fail: "✗" };

export function subjectLine(call: Call, g: Grading, decision: Decision, priority: number): string {
  const x = g.extracted;
  const tag = decision === "QUALIFIED_WITH_NOTES" ? "QUALIFIED · NOTES" : decision;
  const what = x.bhk ? `${x.bhk}BHK` : x.property_type === "villa" ? "Villa" : x.segment === "commercial" ? "Office" : "Home";
  const parts = [`${what} ${x.locality ?? "locality TBC"}`];
  if (x.carpet_sqft) parts.push(fmtSqft(x.carpet_sqft));
  // prefer the month the caller said; a week count converted to a month can land a month early
  const when = monthFromText(x.timeline_text) ?? (x.weeks_until_needed ? monthLabel(call.started_at, x.weeks_until_needed) : null);
  if (when) parts.push(`by ${when}`);
  if (g.flags.vip_referral) parts.push("VIP referral");
  else if (x.referral_source && !/instagram|google|linkedin/i.test(x.referral_source)) parts.push("Referral");
  if (g.flags.repeat_caller) parts.push("Repeat caller");
  return `[${tag} · P${priority}] ${parts.join(" · ")}`;
}

export function factLines(call: Call, g: Grading): [string, string][] {
  const x = g.extracted;
  const rows: [string, string | null][] = [
    ["Name", x.name],
    ["Phone", call.caller_phone],
    ["Locality", x.locality],
    ["Property", [x.bhk ? `${x.bhk}BHK` : null, x.property_type, x.carpet_sqft ? `${fmtSqft(x.carpet_sqft)} carpet` : null].filter(Boolean).join(" · ") || null],
    ["Rooms in scope", x.rooms_in_scope.length ? x.rooms_in_scope.join(", ") : null],
    ["Current state", x.current_state],
    ["Timeline", x.timeline_text],
    ["Decision-maker", x.decision_maker_status],
    ["Budget (volunteered)", x.budget_volunteered],
    ["Found us via", x.referral_source],
    ["Preferred consult", x.preferred_consult_slot],
    ["Asked about price", x.asked_price ? "Yes — given the standard deflection. Expect it early." : null],
  ];
  return rows.filter((r): r is [string, string] => !!r[1]);
}

export interface HandoffEmail { subject: string; text: string; html: string }

export function buildHandoffEmail(args: {
  call: Call; grading: Grading; criteria: Record<CriterionKey, Judgement>; decision: Decision; priority: number;
  designerName: string; dashboardUrl: string; ackUrl: string;
}): HandoffEmail {
  const { call, grading: g, criteria, decision, priority, designerName, dashboardUrl, ackUrl } = args;
  const subject = subjectLine(call, g, decision, priority);
  const facts = factLines(call, g);
  const open = [
    ...RUBRIC_KEYS.filter((k) => criteria[k].verdict === "unclear").map((k) => `Confirm ${CRITERION_LABEL[k].toLowerCase()}${criteria[k].note ? ` — ${criteria[k].note}` : ""}`),
    ...g.open_points,
  ];
  const when = new Date(call.started_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

  const text = [
    `Hi ${designerName.split(" ")[0]},`,
    ``,
    `New lead from a call on ${when}. Priority ${priority}/100.`,
    ``,
    `SUMMARY`,
    g.summary,
    ``,
    `THE GATE (qualified.md)`,
    ...RUBRIC_KEYS.map((k) => `${MARK[criteria[k].verdict]} ${CRITERION_LABEL[k]}${criteria[k].evidence ? ` — "${criteria[k].evidence}"` : criteria[k].note ? ` — ${criteria[k].note}` : ""}`),
    ``,
    `ALREADY ASKED — DON'T RE-ASK`,
    ...facts.map(([k, v]) => `• ${k}: ${v}`),
    ``,
    `OPEN POINTS FOR THE CONSULTATION`,
    ...(open.length ? open.map((o) => `• ${o}`) : ["• None — book the consultation."]),
    ``,
    `Transcript & recording: ${dashboardUrl}`,
    `Acknowledge (takes one click): ${ackUrl}`,
    ``,
    `— Aangan enquiry desk. No prices were quoted on this call.`,
  ].join("\n");

  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const html = `<!doctype html><html><body style="margin:0;background:#f6f1ea;font-family:-apple-system,Segoe UI,Inter,sans-serif;color:#231d17">
<div style="max-width:620px;margin:0 auto;padding:24px">
<p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8a5a3c;margin:0 0 6px">Aangan enquiry desk · ${esc(when)}</p>
<h1 style="font-family:Georgia,serif;font-weight:500;font-size:22px;margin:0 0 16px">${esc(subject)}</h1>
<a href="${ackUrl}" style="display:inline-block;background:#9c4a26;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:600;font-size:14px">Acknowledge — I've got this</a>
<div style="background:#fff;border-radius:14px;padding:18px 20px;margin:18px 0">
<p style="margin:0;line-height:1.55">${esc(g.summary)}</p></div>
<h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#6b6157">The gate</h2>
<table style="width:100%;border-collapse:collapse;font-size:14px">${RUBRIC_KEYS.map((k) => `<tr><td style="padding:6px 0;width:28px;font-weight:700;color:${criteria[k].verdict === "pass" ? "#2f6f4e" : criteria[k].verdict === "fail" ? "#a8322d" : "#a56a00"}">${MARK[criteria[k].verdict]}</td><td style="padding:6px 0;width:150px">${CRITERION_LABEL[k]}</td><td style="padding:6px 0;color:#6b6157">${esc(criteria[k].evidence ? `“${criteria[k].evidence}”` : criteria[k].note ?? "")}</td></tr>`).join("")}</table>
<h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#6b6157;margin-top:22px">Already asked — don't re-ask</h2>
<table style="width:100%;border-collapse:collapse;font-size:14px">${facts.map(([k, v]) => `<tr><td style="padding:5px 0;width:170px;color:#6b6157">${esc(k)}</td><td style="padding:5px 0">${esc(v)}</td></tr>`).join("")}</table>
<h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#6b6157;margin-top:22px">Open points for the consultation</h2>
<ul style="font-size:14px;line-height:1.6;padding-left:18px">${(open.length ? open : ["None — book the consultation."]).map((o) => `<li>${esc(o)}</li>`).join("")}</ul>
<p style="font-size:14px"><a href="${dashboardUrl}" style="color:#9c4a26">Open transcript &amp; recording →</a></p>
<p style="font-size:12px;color:#8b8178;margin-top:28px">No prices were quoted on this call. Pricing is yours to walk through at the consultation.</p>
</div></body></html>`;
  return { subject, text, html };
}

export function buildEscalationEmail(call: Call, g: Grading, reason: string, dashboardUrl: string): HandoffEmail {
  const subject = `[ESCALATION · call back now] ${g.extracted.name ?? call.caller_phone} — ${g.extracted.locality ?? "existing client"}`;
  const text = `${reason}\n\n${g.summary}\n\nCaller: ${call.caller_phone}\nOpen: ${dashboardUrl}`;
  const html = `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:560px"><h2 style="color:#a8322d">${subject}</h2><p>${reason}</p><p>${g.summary}</p><p>Caller: <b>${call.caller_phone}</b></p><p><a href="${dashboardUrl}">Open in dashboard →</a></p></div>`;
  return { subject, text, html };
}

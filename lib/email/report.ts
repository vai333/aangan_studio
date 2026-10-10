// The post-call report: one email after EVERY call, whatever happened, so the
// owner of this inbox has a running log without opening the dashboard.
// It is not the designer handoff (that goes only to qualified leads).
import { fmtDuration, fmtSqft } from "../format";
import { CRITERION_LABEL, DECISION_LABEL, RUBRIC_KEYS, type Assessment, type Call, type Escalation, type Handoff } from "../types";
import { factLines, MARK, type HandoffEmail } from "./handoff";

export function buildCallReportEmail(args: {
  call: Call; assessment: Assessment; handoff: Pick<Handoff, "designer_name" | "designer_email"> | null;
  escalation: Pick<Escalation, "kind" | "reason"> | null; dashboardUrl: string;
}): HandoffEmail {
  const { call, assessment: a, handoff, escalation, dashboardUrl } = args;
  const g = a.grading, x = g.extracted;
  const when = new Date(call.started_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const label = DECISION_LABEL[a.decision].toUpperCase();
  const what = call.status === "missed" ? "Missed call"
    : [x.bhk ? `${x.bhk}BHK` : x.property_type ? x.property_type.replace("_", " ") : null, x.locality, x.carpet_sqft ? fmtSqft(x.carpet_sqft) : null].filter(Boolean).join(" · ") || "Enquiry";
  const subject = `[CALL · ${label}${a.priority ? ` · P${a.priority}` : ""}] ${what} — ${when}`;

  const routed = handoff ? `Sent to designer ${handoff.designer_name} (${handoff.designer_email}).`
    : escalation ? `Escalated (${escalation.kind.replace("_", " ")}): ${escalation.reason}`
    : "Not forwarded to a designer.";
  const facts = factLines(call, g);
  const hasGate = call.status !== "missed" && a.decision !== "ESCALATION";

  const text = [
    `CALL REPORT — ${when} · ${call.status === "missed" ? "missed" : fmtDuration(call.duration_sec)} · ${call.caller_phone}`,
    ``,
    `OUTCOME: ${DECISION_LABEL[a.decision]}`,
    ...a.decision_reasons.map((r) => `• ${r}`),
    routed,
    ``,
    `SUMMARY`,
    g.summary,
    ...(hasGate ? [``, `THE GATE`, ...RUBRIC_KEYS.map((k) => `${MARK[a.grading.criteria[k].verdict]} ${CRITERION_LABEL[k]}${a.grading.criteria[k].evidence ? ` — "${a.grading.criteria[k].evidence}"` : ""}`)] : []),
    ...(facts.length ? [``, `CAPTURED`, ...facts.map(([k, v]) => `• ${k}: ${v}`)] : []),
    ``,
    `Transcript & recording: ${dashboardUrl}`,
    `— Aangan enquiry desk. No prices were quoted on this call.`,
  ].join("\n");

  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const tone = ({ QUALIFIED: "#23854a", QUALIFIED_WITH_NOTES: "#2a78d6", NURTURE: "#b77700", INCOMPLETE: "#7a5cc7", ESCALATION: "#c0392b", NOT_QUALIFIED: "#6b6157" } as const)[a.decision];
  const html = `<!doctype html><html><body style="margin:0;background:#f6f1ea;font-family:-apple-system,Segoe UI,Inter,sans-serif;color:#231d17">
<div style="max-width:620px;margin:0 auto;padding:24px">
<p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8a5a3c;margin:0 0 6px">Call report · ${esc(when)} · ${call.status === "missed" ? "missed" : esc(fmtDuration(call.duration_sec))}</p>
<h1 style="font-family:Georgia,serif;font-weight:500;font-size:22px;margin:0 0 12px">${esc(what)}</h1>
<p style="margin:0 0 14px"><span style="display:inline-block;padding:3px 12px;border-radius:999px;background:${tone}22;color:#231d17;border:1px solid ${tone}66;font-size:13px;font-weight:600">${esc(DECISION_LABEL[a.decision])}</span> <span style="color:#6b6157;font-size:13px">${esc(call.caller_phone)}</span></p>
<div style="background:#fff;border-radius:14px;padding:16px 20px;margin:0 0 16px"><p style="margin:0 0 8px;line-height:1.55">${esc(g.summary)}</p>
<p style="margin:0;font-size:13px;color:#6b6157">${a.decision_reasons.map(esc).join(" ")} ${esc(routed)}</p></div>
${hasGate ? `<table style="width:100%;border-collapse:collapse;font-size:14px">${RUBRIC_KEYS.map((k) => { const j = a.grading.criteria[k]; return `<tr><td style="padding:5px 0;width:26px;font-weight:700;color:${j.verdict === "pass" ? "#2f6f4e" : j.verdict === "fail" ? "#a8322d" : "#a56a00"}">${MARK[j.verdict]}</td><td style="padding:5px 0;width:150px">${CRITERION_LABEL[k]}</td><td style="padding:5px 0;color:#6b6157">${esc(j.evidence ? `“${j.evidence}”` : j.note ?? "")}</td></tr>`; }).join("")}</table>` : ""}
${facts.length ? `<table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:14px">${facts.map(([k, v]) => `<tr><td style="padding:4px 0;width:170px;color:#6b6157">${esc(k)}</td><td style="padding:4px 0">${esc(v)}</td></tr>`).join("")}</table>` : ""}
<p style="font-size:14px;margin-top:18px"><a href="${dashboardUrl}" style="color:#9c4a26">Open transcript &amp; recording →</a></p>
</div></body></html>`;
  return { subject, text, html };
}

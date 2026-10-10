// The gate. Gemini judges each criterion with evidence; this file applies
// qualified.md's decision rules deterministically so every outcome is auditable.
//
// qualified.md, "At the boundary":
//   - Unclear on 1, 2 or 3 → ask one direct question (post-call: not forwarded, callback)
//   - Unclear on 4 or 5   → treat as qualified, note it in the handoff
//   - Fails               → close gracefully; never forward an incomplete or failing lead
// Asking for price never disqualifies (qualified.md, "What does NOT disqualify").

import { checkArea } from "./areas";
import type {
  CallStatus, CriterionKey, Decision, DeclineReason, Grading, Judgement, Settings,
} from "./types";

export interface DecisionResult {
  decision: Decision;
  reasons: string[];
  decline_reason: DeclineReason | null;
  /** Criteria after deterministic guards (area list, lead time, size policy). */
  criteria: Record<CriterionKey, Judgement>;
}

const MUST_BE_CLEAR: CriterionKey[] = ["scope", "real_project", "service_area", "timeline"];
const NOTE_IF_UNCLEAR: CriterionKey[] = ["budget", "decision_maker"];

export function applyGuards(g: Grading, s: Settings): Record<CriterionKey, Judgement> {
  const c = structuredClone(g.criteria);
  const x = g.extracted;

  // Area: the configured list wins over the model's opinion.
  const area = checkArea(x.locality, s.areas_in, s.areas_out);
  if (area.verdict !== "unclear" || c.service_area.verdict === "pass") {
    c.service_area = { ...c.service_area, verdict: area.verdict, note: area.note };
  } else {
    c.service_area = { ...c.service_area, verdict: "unclear", note: area.note };
  }

  // Lead time: too-soon floor. services.md never allows under 6 weeks.
  const floor = Math.max(6, s.policy.min_weeks_to_completion);
  if (x.weeks_until_needed !== null && x.weeks_until_needed < floor) {
    c.timeline = {
      ...c.timeline,
      verdict: "fail",
      note: `Needed in ~${x.weeks_until_needed} weeks; minimum is ${floor}`,
    };
  }

  // Commercial size: services.md caps offices at ~3,000 sq ft. The 500 sq ft
  // minimum is front-desk practice (T18) awaiting Nikhil's confirmation.
  if (x.segment === "commercial" && x.carpet_sqft !== null) {
    if (x.carpet_sqft > s.policy.commercial_max_sqft * 1.1) {
      c.scope = { ...c.scope, verdict: "fail", note: `${x.carpet_sqft} sq ft is above the ~${s.policy.commercial_max_sqft} sq ft office cap` };
    } else if (s.policy.commercial_min_sqft && x.carpet_sqft < s.policy.commercial_min_sqft) {
      c.scope = { ...c.scope, verdict: "fail", note: `${x.carpet_sqft} sq ft is below the ${s.policy.commercial_min_sqft} sq ft minimum (policy pending confirmation)` };
    }
  }
  return c;
}

function declineReasonFor(failed: CriterionKey[], g: Grading, c: Record<CriterionKey, Judgement>): DeclineReason {
  if (failed.includes("scope")) {
    if (c.scope.note?.includes("below")) return "below_min_size";
    if (g.extracted.scope_breadth === "advice_only") return "advice_only";
    return "out_of_scope";
  }
  if (failed.includes("real_project")) return "advice_only";
  if (failed.includes("service_area")) return "outside_area";
  if (failed.includes("budget")) return "budget";
  if (failed.includes("timeline")) return "timeline";
  return "decision_maker";
}

export function decide(g: Grading, status: CallStatus, s: Settings): DecisionResult {
  const criteria = applyGuards(g, s);
  const reasons: string[] = [];

  if (status === "missed") {
    return { decision: "INCOMPLETE", reasons: ["Missed call — no conversation. Auto-queued for callback."], decline_reason: null, criteria };
  }

  // Existing-client complaints are not leads (T09). Never run the gate on them.
  if (g.flags.existing_client) {
    return { decision: "ESCALATION", reasons: ["Existing client with a live project — escalate to Nikhil or a senior person."], decline_reason: null, criteria };
  }

  const keys = Object.keys(criteria) as CriterionKey[];
  const failed = keys.filter((k) => criteria[k].verdict === "fail");
  const unclear = keys.filter((k) => criteria[k].verdict === "unclear");

  if (failed.length > 0) {
    const onlyTimeline = failed.length === 1 && failed[0] === "timeline";
    if (onlyTimeline && g.extracted.open_to_later_start) {
      reasons.push("Timeline can't work as asked, but the caller is open to a later start.");
      return { decision: "NURTURE", reasons, decline_reason: null, criteria };
    }
    for (const k of failed) reasons.push(`Fails: ${k.replace("_", " ")}${criteria[k].note ? ` — ${criteria[k].note}` : ""}`);
    reasons.push(failed.length >= 2 ? "Two or more criteria fail — clear, graceful decline." : "One criterion fails — closed gracefully, not forwarded.");
    return { decision: "NOT_QUALIFIED", reasons, decline_reason: declineReasonFor(failed, g, criteria), criteria };
  }

  // Site not available within the window → keep warm, don't forward yet.
  if (g.extracted.site_available_now === false && g.extracted.weeks_until_needed !== null &&
      g.extracted.weeks_until_needed > s.policy.max_weeks_until_site_ready + 16) {
    reasons.push("Project is real but too far out to start now — re-engage later.");
    return { decision: "NURTURE", reasons, decline_reason: null, criteria };
  }

  const blocking = unclear.filter((k) => MUST_BE_CLEAR.includes(k));
  if (blocking.length > 0) {
    reasons.push(`Still unclear after the call: ${blocking.map((k) => k.replace("_", " ")).join(", ")}. Needs one direct question before a designer sees it.`);
    return { decision: "INCOMPLETE", reasons, decline_reason: null, criteria };
  }

  const notes = unclear.filter((k) => NOTE_IF_UNCLEAR.includes(k));
  if (notes.length > 0) {
    reasons.push(`Forwarded with a note to confirm: ${notes.map((k) => k.replace("_", " ")).join(", ")}.`);
    return { decision: "QUALIFIED_WITH_NOTES", reasons, decline_reason: null, criteria };
  }

  reasons.push("Passes all five criteria and the services check.");
  if (g.extracted.asked_price) reasons.push("Asked about price — deflected; does not disqualify.");
  return { decision: "QUALIFIED", reasons, decline_reason: null, criteria };
}

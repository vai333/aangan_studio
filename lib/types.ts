// Shared domain types. Every rule here traces to a case file:
// qualified.md (the five criteria + boundary rules), services.md (scope gate),
// pricing.md (never quote).

export type Verdict = "pass" | "unclear" | "fail";

/** Gate 0 comes from services.md; criteria 1–5 are Nikhil's rubric in qualified.md. */
export type CriterionKey =
  | "scope"
  | "real_project"
  | "service_area"
  | "timeline"
  | "budget"
  | "decision_maker";

export const RUBRIC_KEYS: CriterionKey[] = [
  "real_project",
  "service_area",
  "timeline",
  "budget",
  "decision_maker",
];

export const CRITERION_LABEL: Record<CriterionKey, string> = {
  scope: "In our services",
  real_project: "Real project",
  service_area: "Service area",
  timeline: "Realistic timeline",
  budget: "Budget band",
  decision_maker: "Decision-maker",
};

export const CRITERION_SOURCE: Record<CriterionKey, string> = {
  scope: "services.md",
  real_project: "qualified.md §1",
  service_area: "qualified.md §2",
  timeline: "qualified.md §3",
  budget: "qualified.md §4",
  decision_maker: "qualified.md §5",
};

export interface Judgement {
  verdict: Verdict;
  /** Verbatim words from the transcript that justify the verdict. */
  evidence: string | null;
  confidence: number; // 0–1
  note?: string;
}

export type Decision =
  | "QUALIFIED"
  | "QUALIFIED_WITH_NOTES"
  | "NURTURE"
  | "NOT_QUALIFIED"
  | "ESCALATION"
  | "INCOMPLETE";

export const DECISION_LABEL: Record<Decision, string> = {
  QUALIFIED: "Qualified",
  QUALIFIED_WITH_NOTES: "Qualified · notes",
  NURTURE: "Nurture",
  NOT_QUALIFIED: "Not a fit",
  ESCALATION: "Escalation",
  INCOMPLETE: "Needs callback",
};

export type CallStatus = "answered" | "missed" | "dropped";

export type Language = "en" | "hi" | "mr" | "mixed";

export interface Extracted {
  name: string | null;
  locality: string | null;
  property_type: "apartment" | "villa" | "independent_house" | "office" | "clinic" | "studio" | "restaurant" | "retail" | "gym" | "other" | null;
  segment: "residential" | "commercial" | null;
  bhk: number | null;
  carpet_sqft: number | null;
  rooms_in_scope: string[];
  scope_breadth: "full" | "partial" | "single_room" | "advice_only" | null;
  current_state: string | null;
  timeline_text: string | null;
  weeks_until_needed: number | null;
  site_available_now: boolean | null;
  open_to_later_start: boolean | null;
  budget_volunteered: string | null;
  decision_maker_status: string | null;
  referral_source: string | null;
  asked_price: boolean;
  preferred_consult_slot: string | null;
  language: Language;
  sentiment: "positive" | "neutral" | "frustrated" | "angry";
}

export interface Flags {
  vip_referral: boolean;
  repeat_caller: boolean;
  existing_client: boolean;
  urgent: boolean;
}

/** What Gemini returns (validated with zod). Gemini judges; code decides. */
export interface Grading {
  criteria: Record<CriterionKey, Judgement>;
  extracted: Extracted;
  flags: Flags;
  summary: string;
  open_points: string[];
}

export interface Assessment {
  id: string;
  call_id: string;
  grading: Grading;
  decision: Decision;
  decision_reasons: string[];
  decline_reason: DeclineReason | null;
  priority: number;
  priority_reasons: string[];
  model: string;
  prompt_version: string;
  rubric_version: string;
  created_at: string;
  override?: Override | null;
}

export type DeclineReason =
  | "outside_area"
  | "advice_only"
  | "out_of_scope"
  | "below_min_size"
  | "timeline"
  | "budget"
  | "decision_maker";

export const DECLINE_LABEL: Record<DeclineReason, string> = {
  outside_area: "Outside Pune / PCMC",
  advice_only: "Advice only, no execution",
  out_of_scope: "Restaurant / retail / gym",
  below_min_size: "Below minimum size",
  timeline: "Timeline impossible",
  budget: "Budget clearly too low",
  decision_maker: "No decision-maker",
};

export interface Override {
  decision: Decision;
  reason: string;
  by: string;
  at: string;
}

export interface TranscriptTurn {
  speaker: "agent" | "caller";
  text: string;
}

export interface Call {
  id: string;
  vaani_call_id: string;
  caller_phone: string;
  started_at: string; // ISO
  answered_after_sec: number | null;
  duration_sec: number;
  status: CallStatus;
  transcript: TranscriptTurn[];
  recording_url: string | null;
  merged_into: string | null;
  source_label?: string; // e.g. "T01" for the September replay set
}

export interface Handoff {
  id: string;
  call_id: string;
  designer_name: string;
  designer_email: string;
  cc: string[];
  subject: string;
  body_text: string;
  provider_message_id: string | null;
  status: "queued" | "sent" | "failed" | "bounced";
  sent_at: string | null;
  acknowledged_at: string | null;
}

export interface Escalation {
  id: string;
  call_id: string;
  kind: "existing_client" | "callback" | "service_recovery" | "area_review";
  reason: string;
  status: "open" | "resolved";
  created_at: string;
  resolved_at: string | null;
}

export interface CostEvent {
  call_id: string | null;
  provider: "vaani" | "gemini" | "email";
  units: number;
  unit: string;
  amount_inr: number;
  at: string;
}

export interface Designer {
  name: string;
  email: string;
  segments: ("residential" | "commercial")[];
  active: boolean;
}

export interface Settings {
  rubric_version: string;
  areas_in: string[];
  areas_out: string[];
  policy: {
    min_weeks_to_completion: number; // too-soon floor (services.md: never under 6)
    max_weeks_until_site_ready: number; // qualified.md §3: 8–10 weeks
    commercial_min_sqft: number | null; // T18 front-desk practice — not in services.md
    commercial_max_sqft: number; // services.md: ~3,000
    unack_hours: number;
  };
  /** HubSpot is the founder's whole-business view. Active only when HUBSPOT_ACCESS_TOKEN is set. */
  hubspot: {
    enabled: boolean;
    pipeline_id: string;          // deal pipeline ("default" in a standard account)
    stage_new: string;            // QUALIFIED / QUALIFIED_WITH_NOTES
    stage_nurture: string;        // NURTURE
    stage_lost: string;           // a deal whose decision is later overridden to a decline
  };
  routing: "round_robin" | "single_inbox";
  leads_inbox: string;
  escalation_email: string;
  founder_email: string;
  /** Gets a summary email after EVERY call (any outcome). Blank = off. Separate from the designer handoff. */
  call_report_email: string;
  designers: Designer[];
  prices: {
    vaani_inr_per_min: number;
    gemini_usd_per_m_input: number;
    gemini_usd_per_m_output: number;
    usd_inr: number;
    email_inr_per_msg: number;
    fixed_inr_per_month: { vercel: number; database: number; email_plan: number; phone_number: number };
  };
  assumptions: {
    avg_project_lakh_low: number;
    avg_project_lakh_high: number;
    qualified_to_project: number; // share of qualified leads that become projects [ASSUMPTION]
    enquiry_fast_conversion: number; // any enquiry answered < 1 hr [ASSUMPTION]
    enquiry_slow_conversion: number; // next-day answer — ¼ of fast, per the brief
    gross_margin: number; // [ASSUMPTION]
    baseline_enquiries: number; // brief: ~200/month
    baseline_unanswered: number; // brief: ~48% no response in 48 h
    avg_call_minutes: number; // T01–T20 average ≈ 4.7 min
  };
}

export interface CallReport {
  id: string;
  call_id: string;
  to_email: string;
  subject: string;
  body_text: string;
  provider_message_id: string | null;
  status: "queued" | "sent" | "failed" | "bounced";
  sent_at: string | null;
}

export interface HubspotSync {
  call_id: string;
  contact_id: string | null;
  deal_id: string | null;
  note_id: string | null;
  portal_id: string | null;
  ui_domain: string | null;
  status: "synced" | "skipped" | "failed";
  attempts: number;
  last_error: string | null;
  synced_at: string | null;
}

export interface CallRecord {
  call: Call;
  assessment: Assessment | null;
  handoff: Handoff | null;
  report: CallReport | null;
  hubspot: HubspotSync | null;
  escalation: Escalation | null;
  costs: CostEvent[];
  repeatCount: number;
}

export function effectiveDecision(a: Assessment | null): Decision | null {
  if (!a) return null;
  return a.override?.decision ?? a.decision;
}

export function isQualified(d: Decision | null): boolean {
  return d === "QUALIFIED" || d === "QUALIFIED_WITH_NOTES";
}

import { DEFAULT_AREAS_IN, DEFAULT_AREAS_OUT } from "./areas";
import type { Settings } from "./types";

// Unit prices checked 2026-10-10 (sources in docs/costing.md).
// Vaani Research developer plan ₹5/min all-in; Gemini 3.5 Flash-Lite $0.30 / $2.50 per 1M tokens;
// Resend free tier (3,000/mo) → ₹0 per email; Vercel Pro $20; Neon Free plan $0 (1 GB, 100 CU-hours).
// USD→INR 88 is an [ASSUMPTION]; edit it in Settings.
export const DEFAULT_SETTINGS: Settings = {
  rubric_version: "qualified.md · 2026-09",
  areas_in: DEFAULT_AREAS_IN,
  areas_out: DEFAULT_AREAS_OUT,
  policy: {
    min_weeks_to_completion: 8,
    max_weeks_until_site_ready: 10,
    commercial_min_sqft: 500,
    commercial_max_sqft: 3000,
    unack_hours: 2,
  },
  hubspot: { enabled: true, pipeline_id: "default", stage_new: "appointmentscheduled", stage_nurture: "appointmentscheduled", stage_lost: "closedlost" },
  routing: "round_robin",
  leads_inbox: "leads@aangan.studio",
  escalation_email: "nikhil@aangan.studio",
  founder_email: "nikhil@aangan.studio",
  call_report_email: "nikhil@aangan.studio",
  designers: [
    { name: "Aryan K.", email: "aryan@aangan.studio", segments: ["residential"], active: true },
    { name: "Meera S.", email: "meera@aangan.studio", segments: ["residential", "commercial"], active: true },
    { name: "Rohan P.", email: "rohan@aangan.studio", segments: ["commercial"], active: true },
    { name: "Isha D.", email: "isha@aangan.studio", segments: ["residential"], active: true },
  ],
  prices: {
    vaani_inr_per_min: 5,
    gemini_usd_per_m_input: 0.3,
    gemini_usd_per_m_output: 2.5,
    usd_inr: 88,
    email_inr_per_msg: 0,
    fixed_inr_per_month: { vercel: 1760, database: 0, email_plan: 0, phone_number: 500 },
  },
  assumptions: {
    avg_project_lakh_low: 8,
    avg_project_lakh_high: 14,
    qualified_to_project: 0.3,
    enquiry_fast_conversion: 0.08,
    enquiry_slow_conversion: 0.02,
    gross_margin: 0.25,
    baseline_enquiries: 200,
    baseline_unanswered: 0.48,
    avg_call_minutes: 4.7,
  },
};

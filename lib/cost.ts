import type { CostEvent, Settings } from "./types";

// Token estimates per graded call: prompt + context files ≈ 3,800, transcript ≈ 1,200,
// structured output ≈ 900. Real counts come from Gemini's usageMetadata in production.
export const EST_INPUT_TOKENS = 5000;
export const EST_OUTPUT_TOKENS = 900;

export function vaaniCost(durationSec: number, s: Settings): number {
  return (durationSec / 60) * s.prices.vaani_inr_per_min; // per-second pro-rata [ASSUMPTION — confirm billing increment]
}

export function geminiCost(inTok: number, outTok: number, s: Settings): number {
  const usd = (inTok / 1e6) * s.prices.gemini_usd_per_m_input + (outTok / 1e6) * s.prices.gemini_usd_per_m_output;
  return usd * s.prices.usd_inr;
}

export function fixedMonthly(s: Settings): number {
  const f = s.prices.fixed_inr_per_month;
  return f.vercel + f.database + f.email_plan + f.phone_number;
}

export function costEventsForCall(
  callId: string, durationSec: number, at: string, emailsSent: number, s: Settings,
  tokens = { input: EST_INPUT_TOKENS, output: EST_OUTPUT_TOKENS }, graded = true,
): CostEvent[] {
  const ev: CostEvent[] = [];
  if (durationSec > 0) ev.push({ call_id: callId, provider: "vaani", units: +(durationSec / 60).toFixed(2), unit: "min", amount_inr: vaaniCost(durationSec, s), at });
  if (graded) ev.push({ call_id: callId, provider: "gemini", units: tokens.input + tokens.output, unit: "tokens", amount_inr: geminiCost(tokens.input, tokens.output, s), at });
  if (emailsSent > 0) ev.push({ call_id: callId, provider: "email", units: emailsSent, unit: "emails", amount_inr: emailsSent * s.prices.email_inr_per_msg, at });
  return ev;
}

export interface Scenario {
  calls: number;
  vaani: number;
  gemini: number;
  email: number;
  fixed: number;
  total: number;
  perCall: number;
}

export function scenario(calls: number, s: Settings, qualifiedShare = 0.55): Scenario {
  const vaani = calls * s.assumptions.avg_call_minutes * s.prices.vaani_inr_per_min;
  const gemini = calls * geminiCost(EST_INPUT_TOKENS, EST_OUTPUT_TOKENS, s);
  const emails = Math.round(calls * (1 + qualifiedShare + 0.05)); // a report for every call + a handoff per qualified lead + escalations; free tier = 3,000/mo and 100/day
  // Resend free covers 3,000/month; beyond that the Pro plan ($20) applies.
  const email = emails * s.prices.email_inr_per_msg + (emails > 3000 ? 20 * s.prices.usd_inr : 0);
  const fixed = fixedMonthly(s);
  const total = vaani + gemini + email + fixed;
  return { calls, vaani, gemini, email, fixed, total, perCall: total / calls };
}

/** What the 48% leak costs today (brief numbers + editable assumptions). */
export function leakPerMonth(s: Settings) {
  const a = s.assumptions;
  const leaked = a.baseline_enquiries * a.baseline_unanswered;
  const lift = a.enquiry_fast_conversion - a.enquiry_slow_conversion;
  const extraProjects = leaked * lift;
  const avg = ((a.avg_project_lakh_low + a.avg_project_lakh_high) / 2) * 1e5;
  const revenue = extraProjects * avg;
  return { leaked, extraProjects, revenue, margin: revenue * a.gross_margin };
}

import type { Grading } from "../types";

/** Missed calls have nothing to grade — every criterion is unclear. */
export function emptyGradingPure(): Grading {
  const u = { verdict: "unclear" as const, evidence: null, confidence: 0 };
  return {
    criteria: { scope: u, real_project: u, service_area: u, timeline: u, budget: u, decision_maker: u },
    extracted: {
      name: null, locality: null, property_type: null, segment: null, bhk: null, carpet_sqft: null, rooms_in_scope: [],
      scope_breadth: null, current_state: null, timeline_text: null, weeks_until_needed: null, site_available_now: null,
      open_to_later_start: null, budget_volunteered: null, decision_maker_status: null, referral_source: null,
      asked_price: false, preferred_consult_slot: null, language: "en", sentiment: "neutral",
    },
    flags: { vip_referral: false, repeat_caller: false, existing_client: false, urgent: false },
    summary: "Missed call — no conversation.",
    open_points: ["Call back"],
  };
}

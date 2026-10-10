// Priority 0–100 orders the designer queue. It NEVER overrides the gate:
// a lead that fails qualified.md scores nothing, however large or warm.
import type { Decision, Grading } from "./types";

export function scorePriority(g: Grading, decision: Decision, repeatCount: number): { score: number; reasons: string[] } {
  if (decision !== "QUALIFIED" && decision !== "QUALIFIED_WITH_NOTES" && decision !== "NURTURE") {
    return { score: 0, reasons: ["Not in the designer queue"] };
  }
  const x = g.extracted;
  const r: string[] = [];
  let s = 0;

  const sq = x.carpet_sqft ?? 0;
  const size = sq >= 3500 ? 35 : sq >= 2000 ? 28 : sq >= 1200 ? 20 : sq >= 700 ? 12 : sq > 0 ? 6 : 8;
  s += size;
  r.push(sq ? `Size ${sq.toLocaleString("en-IN")} sq ft (+${size})` : `Size not given (+${size})`);

  const breadth = x.scope_breadth === "full" ? 15 : x.scope_breadth === "partial" ? 10 : 5;
  s += breadth;
  r.push(`Scope ${x.scope_breadth ?? "unknown"} (+${breadth})`);

  const ready = x.site_available_now ? 15 : x.weeks_until_needed !== null && x.weeks_until_needed <= 10 ? 10 : 4;
  s += ready;
  r.push(x.site_available_now ? `Site ready now (+${ready})` : `Site readiness (+${ready})`);

  if (x.weeks_until_needed !== null && x.weeks_until_needed <= 16) {
    s += 8;
    r.push("Needed within ~4 months (+8)");
  }

  if (g.flags.vip_referral) {
    s += 20;
    r.push("Referred from Nikhil's network (+20)");
  } else if (x.referral_source && /friend|referr|client|builder|ceo/i.test(x.referral_source)) {
    s += 12;
    r.push("Warm referral (+12)");
  }

  if (g.flags.repeat_caller || repeatCount > 0 || x.sentiment === "frustrated") {
    s += 10;
    r.push("Repeat / frustrated caller — service recovery (+10)");
  }

  if (g.criteria.decision_maker.verdict === "pass") {
    s += 5;
    r.push("Decision-maker confirmed (+5)");
  }

  if (decision === "NURTURE") {
    s = Math.round(s * 0.5);
    r.push("Nurture — halved until the timeline opens");
  }
  return { score: Math.min(100, s), reasons: r };
}

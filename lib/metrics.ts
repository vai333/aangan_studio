// Everything Nikhil used to pull by hand, computed from the call records.
import { fixedMonthly } from "./cost";
import { isAfterHours, istHour } from "./format";
import { effectiveDecision, isQualified, type CallRecord, type Decision, type DeclineReason, type Settings } from "./types";

export type PeriodKey = "7d" | "30d" | "mtd" | "all";
export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "mtd", label: "This month" },
  { key: "all", label: "All time" },
];

export function periodRange(key: PeriodKey, now: Date): { from: Date; to: Date; days: number } {
  const to = now;
  let from: Date;
  if (key === "7d") from = new Date(now.getTime() - 7 * 864e5);
  else if (key === "30d") from = new Date(now.getTime() - 30 * 864e5);
  else if (key === "mtd") from = new Date(new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).setDate(1));
  else from = new Date(0);
  if (key === "mtd") from.setHours(0, 0, 0, 0);
  const days = key === "all" ? 30 : Math.max(1, (to.getTime() - from.getTime()) / 864e5);
  return { from, to, days };
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export interface Metrics {
  enquiries: number;
  answered: number;
  missed: number;
  answeredRate: number;
  medianAnswerSec: number | null;
  medianHandoffSec: number | null;
  medianAckMin: number | null;
  qualified: number;
  qualifiedRate: number;
  leads: number; // answered calls about a new project (excludes existing-client escalations and missed calls)
  decisions: Record<Decision, number>;
  declines: { reason: DeclineReason; count: number }[];
  afterHours: number;
  afterHoursQualified: number;
  byHour: number[];
  handedOff: number;
  acknowledged: number;
  unacked: CallRecord[];
  openEscalations: CallRecord[];
  pipelineLow: number;
  pipelineHigh: number;
  cost: { vaani: number; gemini: number; email: number; fixed: number; total: number };
  costPerCall: number;
  costPerQualified: number | null;
  vaaniMinutes: number;
  tokens: number;
}

export function computeMetrics(all: CallRecord[], s: Settings, range: { from: Date; to: Date; days: number }, now: Date): Metrics {
  const inRange = all.filter((r) => {
    const t = new Date(r.call.started_at).getTime();
    return t >= range.from.getTime() && t <= range.to.getTime();
  });
  const recs = inRange.filter((r) => !r.call.merged_into);
  const decisions = { QUALIFIED: 0, QUALIFIED_WITH_NOTES: 0, NURTURE: 0, NOT_QUALIFIED: 0, ESCALATION: 0, INCOMPLETE: 0 } as Record<Decision, number>;
  const declineMap = new Map<DeclineReason, number>();
  const byHour = Array(24).fill(0);
  let afterHours = 0, afterHoursQualified = 0;

  for (const r of recs) {
    const d = effectiveDecision(r.assessment);
    if (d) decisions[d]++;
    if (d === "NOT_QUALIFIED" && r.assessment?.decline_reason) declineMap.set(r.assessment.decline_reason, (declineMap.get(r.assessment.decline_reason) ?? 0) + 1);
    byHour[istHour(r.call.started_at)]++;
    if (isAfterHours(r.call.started_at)) {
      afterHours++;
      if (isQualified(d)) afterHoursQualified++;
    }
  }

  const answered = recs.filter((r) => r.call.status !== "missed").length;
  const qualified = decisions.QUALIFIED + decisions.QUALIFIED_WITH_NOTES;
  const leads = answered - decisions.ESCALATION; // prospective projects we actually spoke to
  const handoffs = recs.map((r) => r.handoff).filter((h): h is NonNullable<typeof h> => !!h && h.status === "sent");

  const unackMs = s.policy.unack_hours * 3600e3;
  const unacked = recs.filter((r) => r.handoff?.sent_at && !r.handoff.acknowledged_at && now.getTime() - new Date(r.handoff.sent_at).getTime() > unackMs && isQualified(effectiveDecision(r.assessment)));
  const openEscalations = all.filter((r) => r.escalation?.status === "open");

  const a = s.assumptions;
  const pipelineLow = qualified * a.qualified_to_project * a.avg_project_lakh_low * 1e5;
  const pipelineHigh = qualified * a.qualified_to_project * a.avg_project_lakh_high * 1e5;

  const ev = inRange.flatMap((r) => r.costs);
  const sum = (p: string) => ev.filter((e) => e.provider === p).reduce((t, e) => t + e.amount_inr, 0);
  const earliest = Math.min(...recs.map((r) => new Date(r.call.started_at).getTime()), range.to.getTime());
  const days = range.from.getTime() === 0 ? Math.max(1, (range.to.getTime() - earliest) / 864e5) : range.days;
  const fixed = fixedMonthly(s) * (days / 30);
  const cost = { vaani: sum("vaani"), gemini: sum("gemini"), email: sum("email"), fixed, total: 0 };
  cost.total = cost.vaani + cost.gemini + cost.email + cost.fixed;

  return {
    enquiries: recs.length,
    answered,
    missed: recs.length - answered,
    answeredRate: recs.length ? answered / recs.length : 1,
    medianAnswerSec: median(recs.map((r) => r.call.answered_after_sec).filter((x): x is number => x !== null)),
    medianHandoffSec: median(recs.filter((r) => r.handoff?.sent_at).map((r) => (new Date(r.handoff!.sent_at!).getTime() - new Date(r.call.started_at).getTime()) / 1000 - r.call.duration_sec)),
    medianAckMin: median(handoffs.filter((h) => h.acknowledged_at && h.sent_at).map((h) => (new Date(h.acknowledged_at!).getTime() - new Date(h.sent_at!).getTime()) / 60000)),
    qualified,
    qualifiedRate: leads ? qualified / leads : 0,
    leads,
    decisions,
    declines: [...declineMap.entries()].map(([reason, count]) => ({ reason, count })).sort((x, y) => y.count - x.count),
    afterHours,
    afterHoursQualified,
    byHour,
    handedOff: handoffs.length,
    acknowledged: handoffs.filter((h) => h.acknowledged_at).length,
    unacked,
    openEscalations,
    pipelineLow,
    pipelineHigh,
    cost,
    costPerCall: recs.length ? cost.total / recs.length : 0,
    costPerQualified: qualified ? cost.total / qualified : null,
    vaaniMinutes: ev.filter((e) => e.provider === "vaani").reduce((t, e) => t + e.units, 0),
    tokens: ev.filter((e) => e.provider === "gemini").reduce((t, e) => t + e.units, 0),
  };
}

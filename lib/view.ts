import type { FlagKey } from "@/components/ui";
import { fmtSqft, isAfterHours } from "./format";
import type { CallRecord } from "./types";

export function flagsFor(r: CallRecord, all?: CallRecord[]): FlagKey[] {
  const g = r.assessment?.grading;
  const f: FlagKey[] = [];
  if (g?.flags.vip_referral) f.push("vip");
  if (g?.flags.repeat_caller || r.repeatCount > 0) f.push("repeat");
  if (g && (g.extracted.sentiment === "frustrated" || g.extracted.sentiment === "angry")) f.push("frustrated");
  if (isAfterHours(r.call.started_at)) f.push("after");
  if (all?.some((o) => o.call.merged_into === r.call.id)) f.push("merged");
  if (g?.extracted.asked_price) f.push("price");
  if (g?.extracted.decision_maker_status?.toLowerCase().includes("tenant")) f.push("rented");
  return f;
}

export function projectLine(r: CallRecord): string {
  const x = r.assessment?.grading.extracted;
  if (r.call.status === "missed") return "Missed call";
  if (!x) return r.call.status === "dropped" ? "Dropped call" : "—";
  const what = x.bhk ? `${x.bhk}BHK` : x.property_type === "villa" ? "Villa" : x.property_type === "office" ? "Office" : x.property_type === "restaurant" ? "Restaurant" : x.property_type === "studio" ? "Studio" : x.segment === "commercial" ? "Commercial" : "Home";
  return [what, x.locality, x.carpet_sqft ? fmtSqft(x.carpet_sqft) : null].filter(Boolean).join(" · ");
}

export function callerName(r: CallRecord): string {
  return r.assessment?.grading.extracted.name ?? "Unknown caller";
}

import type { Verdict } from "./types";

// Defaults copied from services.md → "Service area". Editable in Settings.
export const DEFAULT_AREAS_IN = [
  "Kothrud", "Baner", "Aundh", "Wakad", "Koregaon Park", "Kalyani Nagar", "Viman Nagar",
  "Hadapsar", "Magarpatta", "NIBM", "Kondhwa", "Undri", "Shivane", "Warje", "Erandwane",
  "Deccan", "Pimpri", "Chinchwad", "Pimple Saudagar", "Pimple Nilakh", "Ravet", "Hinjewadi",
];

export const DEFAULT_AREAS_OUT = ["Talegaon", "Lonavala", "Nashik", "Mumbai"];

// Common ways callers name a place that maps to a listed area.
const ALIASES: Record<string, string> = {
  "kp": "Koregaon Park",
  "cybercity": "Magarpatta",
  "magarpatta city": "Magarpatta",
  "dahanukar colony": "Kothrud",
  "sunderban": "Aundh",
  "nibm road": "NIBM",
  "pcmc": "Pimpri",
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

export interface AreaCheck {
  verdict: Verdict;
  matched: string | null;
  note: string;
}

/**
 * Deterministic area check. Unknown localities are `unclear`, never `fail` —
 * services.md allows "adjoining areas", so a human decides and can add the
 * locality to the list in one click.
 */
export function checkArea(locality: string | null, areasIn: string[], areasOut: string[]): AreaCheck {
  if (!locality) return { verdict: "unclear", matched: null, note: "Locality not captured" };
  const n = norm(locality);
  const alias = Object.entries(ALIASES).find(([k]) => n.includes(k));
  const candidates = alias ? [n, norm(alias[1])] : [n];

  for (const c of candidates) {
    const out = areasOut.find((a) => c.includes(norm(a)));
    if (out) return { verdict: "fail", matched: out, note: `${out} is on the not-served list` };
    const hit = areasIn.find((a) => c.includes(norm(a)) || norm(a).includes(c));
    if (hit) return { verdict: "pass", matched: hit, note: `${hit} is in the service area` };
  }
  if (n === "pune") return { verdict: "unclear", matched: null, note: "Only 'Pune' given — locality needed" };
  return { verdict: "unclear", matched: null, note: `${locality} is not on the area list yet — confirm and add it` };
}

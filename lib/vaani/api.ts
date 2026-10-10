import "server-only";
import type { TranscriptTurn } from "../types";
import { parseTranscriptString } from "./adapter";

// Vaani Research public API (docs.vaanivoice.ai, checked 2026-10-10). Auth: X-API-Key.
const BASE = process.env.VAANI_API_BASE || "https://api.vaanivoice.ai";

export const vaaniConfigured = () => !!process.env.VAANI_API_KEY;

async function get(path: string): Promise<{ ok: boolean; status: number; body: any }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const url = path.startsWith("http") ? path : BASE + path;
  const res = await fetch(url, { headers: { "X-API-Key": process.env.VAANI_API_KEY ?? "" }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* plain text transcript */ }
  return { ok: res.ok, status: res.status, body };
}

export interface HistoryItem {
  call_id: string;
  call_type?: string;
  direction?: string;
  call_status?: string;
  from_number?: string;
  to_number?: string;
  Start_time?: string;
  End_time?: string;
  user_picked_up_at?: string | null;
  duration_ms?: number;
  call_summary?: string;
  post_processing_status?: string;
  recording_api?: string;
  call_transcription?: string;
}

export interface HistoryPage { items: HistoryItem[]; hasNext: boolean }

export async function fetchHistory(page = 1, pageSize = 50): Promise<HistoryPage> {
  const r = await get(`/api/call-history?page=${page}&page_size=${pageSize}`);
  if (!r.ok) throw new Error(`Vaani call history ${r.status}: ${typeof r.body === "string" ? r.body.slice(0, 200) : r.body?.message ?? JSON.stringify(r.body).slice(0, 200)}`);
  const items: HistoryItem[] = Array.isArray(r.body) ? r.body : r.body?.data ?? [];
  return { items, hasNext: !!r.body?.pagination?.has_next };
}

/** The transcript endpoint's response shape isn't documented; accept the shapes it could plausibly use. */
export function parseAnyTranscript(body: unknown): TranscriptTurn[] {
  if (!body) return [];
  if (typeof body === "string") return parseTranscriptString(body);
  if (Array.isArray(body)) {
    return body
      .map((t: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        speaker: /user|customer|caller|human/i.test(String(t.role ?? t.speaker ?? "")) ? ("caller" as const) : ("agent" as const),
        text: String(t.message ?? t.text ?? t.content ?? "").trim(),
      }))
      .filter((t) => t.text);
  }
  const o = body as Record<string, unknown>;
  for (const k of ["transcription", "transcript", "text", "data", "chat_history", "messages"]) {
    if (o[k]) { const t = parseAnyTranscript(o[k]); if (t.length) return t; }
  }
  return [];
}

export async function fetchTranscript(item: HistoryItem): Promise<TranscriptTurn[]> {
  const tries = [item.call_transcription, `/api/transcript/${encodeURIComponent(item.call_id)}`, `/api/call_details/${encodeURIComponent(item.call_id)}`].filter(Boolean) as string[];
  for (const path of tries) {
    try {
      const r = await get(path);
      if (!r.ok) continue;
      const t = parseAnyTranscript(r.body);
      if (t.length) return t;
    } catch { /* try the next endpoint */ }
  }
  return [];
}

export interface CallById { turns: TranscriptTurn[]; durationSec: number; summary: string | null }

/** Read one call by its Vaani call id: transcript (+ a duration inferred from its [HH:MM:SS] stamps). */
export async function fetchCallById(callId: string): Promise<CallById | null> {
  for (const path of [`/api/transcript/${encodeURIComponent(callId)}`, `/api/call_details/${encodeURIComponent(callId)}`]) {
    try {
      const r = await get(path);
      if (!r.ok) continue;
      const raw: unknown = typeof r.body === "string" ? r.body : r.body?.transcription ?? r.body?.transcript ?? r.body;
      const turns = parseAnyTranscript(raw);
      if (!turns.length) continue;
      const stamps = typeof raw === "string" ? [...raw.matchAll(/\[(\d\d):(\d\d):(\d\d)\]/g)] : [];
      const last = stamps.at(-1);
      return { turns, durationSec: last ? +last[1] * 3600 + +last[2] * 60 + +last[3] : turns.length * 8, summary: r.body?.summary ?? null };
    } catch { /* try the next endpoint */ }
  }
  return null;
}

/** Caller's number comes from the Call History API, not the webhook. */
export async function lookupCallerPhone(providerCallId: string): Promise<string | null> {
  if (!vaaniConfigured()) return null;
  try {
    const { items } = await fetchHistory(1, 50);
    const hit = items.find((i) => i.call_id === providerCallId);
    return hit?.from_number ?? null;
  } catch {
    return null;
  }
}

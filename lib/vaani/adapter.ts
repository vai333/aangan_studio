// Vaani → internal call shape.
//
// Field names below come from Vaani Research's public docs (docs.vaanivoice.ai,
// checked 2026-10-10): event `call_postprocessing` with data.{call_id, call_duration (ms),
// end_reason, summary, entities, recording_url, transcript ("[HH:MM:SS] AGENT:/USER:" lines)},
// and `call_ended` with {room_name, call_duration (s), end_reason}. Signature header
// `X-Vaani-Signature: sha256=<hex>` over "{X-Vaani-Timestamp}.{raw_body}".
// The other product sold as "VaaniAI" (vaaniai.io) sends `call.completed` with
// {call_id, customer_phone, call_duration_seconds, transcript:[{role,message}], recording_url};
// both shapes are accepted. Anything marked [VERIFY IN VAANI DOCS] was not confirmed.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { CallStatus, TranscriptTurn } from "../types";

export interface VaaniEvent {
  kind: "post_call" | "call_ended";
  event: string;
  providerCallId: string;
  startedAt: string;
  durationSec: number;
  endReason: string | null;
  transcript: TranscriptTurn[];
  recordingUrl: string | null;
  callerPhone: string | null;
  /** true when startedAt is Vaani's own timestamp rather than end − duration */
  startExact?: boolean;
}

const safeEq = (x: string, y: string) => { const a = Buffer.from(x), b = Buffer.from(y); return a.length === b.length && timingSafeEqual(a, b); };

/**
 * Who may call the webhook? Either:
 *  - a correct HMAC signature (VAANI_WEBHOOK_SECRET), if Vaani signs the dashboard webhook, or
 *  - the secret token in the URL (?token=…, VAANI_WEBHOOK_TOKEN), which works whether or not Vaani signs.
 * In production at least one must be configured, otherwise every request is refused.
 */
export function authorizeWebhook(raw: string, headers: Headers, urlToken: string | null): { ok: boolean; why?: string } {
  const token = process.env.VAANI_WEBHOOK_TOKEN;
  if (token && urlToken && safeEq(urlToken, token)) return { ok: true };
  if (process.env.VAANI_WEBHOOK_SECRET && headers.get("x-vaani-signature")) return verifySignature(raw, headers);
  if (!token && !process.env.VAANI_WEBHOOK_SECRET) return process.env.NODE_ENV === "production" ? { ok: false, why: "webhook auth not configured" } : { ok: true, why: "unauthenticated (dev)" };
  return { ok: false, why: "bad or missing webhook credentials" };
}

export function verifySignature(raw: string, headers: Headers): { ok: boolean; why?: string } {
  const secret = process.env.VAANI_WEBHOOK_SECRET;
  if (!secret) {
    return process.env.NODE_ENV === "production" ? { ok: false, why: "VAANI_WEBHOOK_SECRET not set" } : { ok: true, why: "unsigned (dev)" };
  }
  const header = headers.get("x-vaani-signature") ?? "";
  const sig = header.replace(/^sha256=/, "");
  const ts = headers.get("x-vaani-timestamp");
  let expected: string;
  if (ts) {
    if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return { ok: false, why: "stale timestamp" };
    expected = createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
  } else {
    expected = createHmac("sha256", secret).update(raw).digest("hex"); // vaaniai.io style [VERIFY IN VAANI DOCS]
  }
  const a = Buffer.from(sig), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? { ok: true } : { ok: false, why: "bad signature" };
}

export function parseTranscriptString(s: string): TranscriptTurn[] {
  const turns: TranscriptTurn[] = [];
  for (const line of s.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:\[[\d:]+\]\s*)?(AGENT|ASSISTANT|BOT|USER|CUSTOMER|CALLER)\s*:\s*(.*)$/i);
    if (m) turns.push({ speaker: /USER|CUSTOMER|CALLER/i.test(m[1]) ? "caller" : "agent", text: m[2].trim() });
    else if (line.trim() && turns.length) turns[turns.length - 1].text += " " + line.trim();
  }
  return turns;
}

type P = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** "N/A", empty or a browser (WebRTC) test call has no real phone number. */
const realPhone = (v: unknown): string | null => {
  const t = typeof v === "string" ? v.trim() : "";
  return t && t.replace(/\D/g, "").length >= 8 ? t : null;
};
const validIso = (v: unknown): string | null => { const t = typeof v === "string" ? new Date(v) : null; return t && !isNaN(t.getTime()) ? t.toISOString() : null; };

/** Vaani documents call_duration in ms for post-processing but sends seconds on call_ended: no real call lasts 10,000 s. */
const toSeconds = (n: unknown) => { const v = Number(n ?? 0); return Math.round(v > 10_000 ? v / 1000 : v); };

export function normalize(p: P): VaaniEvent | null {
  const event: string = p.event ?? p.type ?? "";
  // Vaani Research. Shapes confirmed from a real call on 2026-10-10:
  //   call_ended { event, timestamp, from, to, data: { room_name, end_reason, transcript:"[hh:mm:ss] AGENT: …", phone_number, call_duration (s), technical_issue } }
  //   call_postprocessing (per docs) { event, call_id, data: { room_name, call_id, call_duration, summary, entities, recording_url, transcript } }
  // The call is keyed by room_name (present on both), falling back to call_id.
  if ((event === "call_postprocessing" || event === "call_ended") && (p.data || p.room_name || p.call_id)) {
    const d = p.data ?? p;
    const id = d.room_name ?? p.room_name ?? d.call_id ?? p.call_id;
    if (!id) { console.warn("vaani event without a call id:", event); return null; }
    const durationSec = toSeconds(d.call_duration ?? p.call_duration);
    const end = p.timestamp ? new Date(p.timestamp) : new Date();
    const transcript = typeof d.transcript === "string" ? parseTranscriptString(d.transcript) : [];
    return {
      // call_ended carries the transcript too, so it is graded straight away; without one it only makes a placeholder
      kind: transcript.length || event === "call_postprocessing" ? "post_call" : "call_ended",
      event, providerCallId: String(id),
      // post-processing carries the exact start; call_ended only the end, so derive it from the duration
      startedAt: validIso(d.call_started_at) ?? new Date(end.getTime() - durationSec * 1000).toISOString(), durationSec,
      endReason: d.end_reason ?? p.end_reason ?? null,
      transcript, recordingUrl: d.recording_url ?? null, startExact: !!validIso(d.call_started_at),
      callerPhone: realPhone(d.phone_number) ?? realPhone(d.from_number) ?? realPhone(d.caller_number) ?? realPhone(p.from_number) ?? realPhone(p.from),
    };
  }
  // vaaniai.io — call.completed / call.failed / call.no_answer [VERIFY IN VAANI DOCS]
  if (event.startsWith("call.")) {
    const durationSec = Number(p.call_duration_seconds ?? p.duration ?? 0);
    const end = p.timestamp ? new Date(p.timestamp) : new Date();
    const transcript: TranscriptTurn[] = Array.isArray(p.transcript)
      ? p.transcript.map((t: P) => ({ speaker: /user|customer|caller/i.test(t.role) ? "caller" : "agent", text: String(t.message ?? t.content ?? "") }))
      : typeof p.transcript === "string" ? parseTranscriptString(p.transcript) : [];
    return {
      kind: event === "call.completed" ? "post_call" : "call_ended", event, providerCallId: String(p.call_id),
      startedAt: new Date(end.getTime() - durationSec * 1000).toISOString(), durationSec, endReason: p.disposition ?? event,
      transcript, recordingUrl: p.recording_url ?? null, callerPhone: p.customer_phone ?? null,
    };
  }
  return null;
}

/**
 * Inbound calls have no "missed" event in Vaani Research's docs, so we classify
 * from what arrives: no caller speech → missed; a short call with ≤1 caller turn → dropped.
 */
export function classify(e: VaaniEvent): CallStatus {
  const callerTurns = e.transcript.filter((t) => t.speaker === "caller" && t.text.length > 2).length;
  if (e.durationSec < 5 || (e.kind === "post_call" && callerTurns === 0)) return "missed";
  if (/no_answer|failed|rejected/i.test(e.endReason ?? "")) return "missed";
  if (e.durationSec < 90 && callerTurns <= 1) return "dropped";
  return "answered";
}

export function toE164(p: string | null): string {
  if (!p) return "unknown";
  const d = p.replace(/\D/g, "");
  if (d.length < 8) return "unknown";
  if (d.length === 10) return `+91${d}`;
  if (d.length === 12 && d.startsWith("91")) return `+${d}`;
  return `+${d}`;
}

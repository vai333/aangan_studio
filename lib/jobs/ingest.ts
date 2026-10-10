import "server-only";
import { json, q, q1 } from "../db";
import type { CallStatus, TranscriptTurn } from "../types";

export interface IngestInput {
  providerCallId: string;
  phone: string;
  startedAt: string;
  durationSec: number;
  endReason: string | null;
  status: CallStatus;
  transcript: TranscriptTurn[];
  recordingUrl: string | null;
  raw: unknown;
  source: "webhook" | "sync";
  /** Seconds from ring to pick-up, only when the source reports it (the webhook does not). */
  answeredAfterSec?: number | null;
  /** The start time is Vaani's own timestamp, so it may overwrite an earlier derived one. */
  startExact?: boolean;
  /** call_ended carries no transcript: create a placeholder, never overwrite a real post-call row. */
  placeholder?: boolean;
}

export interface IngestResult { id: string; status: CallStatus; startedAt: string; created: boolean }

export async function ingestCall(i: IngestInput): Promise<IngestResult | null> {
  let callerId: string | null = null;
  if (i.phone !== "unknown") {
    const c = await q1(
      `insert into callers (phone_e164, last_seen_at, call_count) values ($1, now(), 1)
       on conflict (phone_e164) do update set last_seen_at = now(), call_count = callers.call_count + 1 returning id`, [i.phone]);
    callerId = c?.id ?? null;
  }

  const existing = await q1("select id from calls where provider = 'vaani' and provider_call_id = $1", [i.providerCallId]);
  const rows = i.placeholder
    ? await q(
        `insert into calls (provider, provider_call_id, source, caller_id, caller_phone, started_at, duration_sec, status, end_reason, transcript)
         values ('vaani', $1, $2, $3, $4, $5, $6, $7, $8, '[]'::jsonb)
         on conflict (provider, provider_call_id) do nothing returning id, status, started_at`,
        [i.providerCallId, i.source, callerId, i.phone, i.startedAt, i.durationSec, i.status, i.endReason])
    : await q(
        `insert into calls (provider, provider_call_id, source, caller_id, caller_phone, started_at, answered_after_sec, duration_sec, status, end_reason, transcript, recording_url, raw_payload)
         values ('vaani', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12::jsonb)
         on conflict (provider, provider_call_id) do update set
           caller_id = coalesce(excluded.caller_id, calls.caller_id),
           caller_phone = case when excluded.caller_phone = 'unknown' then calls.caller_phone else excluded.caller_phone end,
           started_at = case when $13::boolean then excluded.started_at else calls.started_at end, duration_sec = excluded.duration_sec, status = excluded.status,
           end_reason = excluded.end_reason, transcript = excluded.transcript, recording_url = coalesce(excluded.recording_url, calls.recording_url),
           raw_payload = excluded.raw_payload,
           grade_status = case when calls.grade_status = 'done' and calls.transcript = excluded.transcript then 'done' else calls.grade_status end
         returning id, status, started_at`,
        [i.providerCallId, i.source, callerId, i.phone, i.startedAt, i.answeredAfterSec ?? null, i.durationSec, i.status, i.endReason, json(i.transcript), i.recordingUrl, json(i.raw), i.startExact ?? false]);
  const row = rows[0] ?? (await q1("select id, status, started_at from calls where provider = 'vaani' and provider_call_id = $1", [i.providerCallId]));
  if (!row) return null;
  return { id: row.id, status: row.status, startedAt: row.started_at, created: !existing };
}

/** T17: a dropped call from the same number in the 30 minutes before this one is the same enquiry. */
export async function mergeDropped(callId: string, phone: string, startedAt: string): Promise<number> {
  if (phone === "unknown") return 0;
  const since = new Date(new Date(startedAt).getTime() - 30 * 60_000).toISOString();
  const dropped = await q(
    `select id from calls where caller_phone = $1 and id <> $2 and status in ('dropped','missed') and merged_into is null
       and started_at >= $3 and started_at < $4`, [phone, callId, since, startedAt]);
  for (const d of dropped) {
    await q("update calls set merged_into = $1, grade_status = 'skipped' where id = $2", [callId, d.id]);
    await q("update escalations set status = 'resolved', resolved_at = now(), resolved_by = 'merged with redial' where call_id = $1 and status = 'open'", [d.id]);
  }
  return dropped.length;
}

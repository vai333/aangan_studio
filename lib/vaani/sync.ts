import "server-only";
import { q1 } from "../db";
import { gradeCall } from "../jobs/grade";
import { ingestCall, mergeDropped } from "../jobs/ingest";
import { classify, toE164 } from "./adapter";
import { fetchHistory, fetchTranscript, vaaniConfigured, type HistoryItem } from "./api";

export interface SyncResult { fetched: number; imported: number; updated: number; skipped: number; graded: number; error?: string }

// Vaani timestamps are timezone-less ISO strings in UTC (confirmed against API error timestamps).
const utc = (s?: string | null) => (s ? new Date(/Z|[+-]\d\d:?\d\d$/.test(s) ? s : s + "Z").toISOString() : null);

function answeredAfter(i: HistoryItem): number | null {
  const ring = utc(i.Start_time), up = utc(i.user_picked_up_at);
  return ring && up ? Math.max(0, Math.round((new Date(up).getTime() - new Date(ring).getTime()) / 1000)) : null;
}

function secondsOf(i: HistoryItem): number {
  const start = utc(i.user_picked_up_at) ?? utc(i.Start_time), end = utc(i.End_time);
  if (start && end) return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  return 0; // duration_ms in the docs' example doesn't match the timestamps, so it isn't trusted
}

/**
 * Pull recent calls from Vaani's Call History API into the database, transcripts included.
 * Safe to run repeatedly: calls already stored are skipped (or filled in, if they were stored
 * before their transcript was ready). It backs up the webhook, which remains the fast path.
 */
export async function syncFromVaani(opts: { pages?: number; pageSize?: number; grade?: boolean } = {}): Promise<SyncResult> {
  const r: SyncResult = { fetched: 0, imported: 0, updated: 0, skipped: 0, graded: 0 };
  if (!vaaniConfigured()) return { ...r, error: "VAANI_API_KEY is not set" };

  try {
    for (let page = 1; page <= (opts.pages ?? 1); page++) {
      const { items, hasNext } = await fetchHistory(page, opts.pageSize ?? 50);
      for (const item of items) {
        r.fetched++;
        const inbound = /inbound|incoming/i.test(`${item.call_type ?? ""} ${item.direction ?? ""}`) || (!item.call_type && !item.direction);
        if (!inbound) { r.skipped++; continue; }

        const have = await q1("select id, jsonb_array_length(transcript) as n from calls where provider = 'vaani' and provider_call_id = $1", [item.call_id]);
        if (have && have.n > 0) { r.skipped++; continue; }
        if (item.post_processing_status && !/complete/i.test(item.post_processing_status) && !have) { r.skipped++; continue; } // not ready yet — next run

        const transcript = await fetchTranscript(item);
        const durationSec = secondsOf(item);
        const status = classify({ kind: "post_call", event: "sync", providerCallId: item.call_id, startedAt: "", durationSec, endReason: item.call_status ?? null, transcript, recordingUrl: null, callerPhone: null });
        const phone = toE164(item.from_number ?? null);
        const saved = await ingestCall({
          providerCallId: item.call_id, phone, startedAt: utc(item.Start_time) ?? new Date().toISOString(), durationSec,
          endReason: item.call_status ?? null, status, transcript, recordingUrl: item.recording_api ?? null, raw: item, source: "sync",
          answeredAfterSec: answeredAfter(item),
        });
        if (!saved) continue;
        saved.created ? r.imported++ : r.updated++;
        await mergeDropped(saved.id, phone, saved.startedAt);
        if (opts.grade !== false && transcript.length) {
          await gradeCall(saved.id).then(() => r.graded++).catch((e) => console.error("grade failed", saved.id, e));
        }
      }
      if (!hasNext) break;
    }
  } catch (e) {
    r.error = String(e instanceof Error ? e.message : e);
  }
  return r;
}

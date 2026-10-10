// POST /api/vaani/webhook — Vaani post-call delivery.
// Verify → dedupe → store → answer 200 inside Vaani's 5-second window → grade in after().
import { after, NextResponse, type NextRequest } from "next/server";
import { dbConfigured, json, q1 } from "@/lib/db";
import { gradeCall } from "@/lib/jobs/grade";
import { ingestCall, mergeDropped } from "@/lib/jobs/ingest";
import { lookupCallerPhone } from "@/lib/vaani/api";
import { authorizeWebhook, classify, normalize, toE164 } from "@/lib/vaani/adapter";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = authorizeWebhook(raw, req.headers, req.nextUrl.searchParams.get("token"));
  if (!sig.ok) { console.warn("vaani webhook rejected:", sig.why); return NextResponse.json({ error: sig.why }, { status: 401 }); }
  if (!dbConfigured()) return NextResponse.json({ error: "DATABASE_URL not set (demo mode)" }, { status: 503 });

  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const ev = normalize(payload as Record<string, unknown>);
  if (!ev) return NextResponse.json({ ignored: true });

  try {
    // Idempotency: Vaani retries up to 5× — the same event is processed once.
    const key = `vaani:${ev.event}:${ev.providerCallId}`;
    const fresh = await q1("insert into webhook_events (source, idempotency_key, payload) values ('vaani', $1, $2::jsonb) on conflict (idempotency_key) do nothing returning id", [key, json(payload)]);
    if (!fresh) return NextResponse.json({ duplicate: true });

    const phone = toE164(ev.callerPhone ?? (await lookupCallerPhone(ev.providerCallId)));
    const status = classify(ev);

    // Out of order: `call_ended` may land before or after the post-call event.
    // Post-call carries the transcript and always wins; call_ended only creates a placeholder.
    const call = await ingestCall({
      providerCallId: ev.providerCallId, phone, startedAt: ev.startedAt, durationSec: ev.durationSec, endReason: ev.endReason,
      status, transcript: ev.transcript, recordingUrl: ev.recordingUrl, raw: payload, source: "webhook", startExact: ev.startExact, placeholder: ev.kind !== "post_call",
    });
    if (!call) return NextResponse.json({ ok: true, note: "placeholder exists" });

    if (ev.kind === "post_call" && status === "answered") await mergeDropped(call.id, phone, call.startedAt);

    // Only post-call events are graded immediately; a bare call_ended waits for the sweep
    // (so a late transcript isn't missed), and is graded as missed/dropped if none arrives.
    if (ev.kind === "post_call") after(() => gradeCall(call.id).catch((e) => console.error("grade failed", call.id, e)));
    return NextResponse.json({ ok: true, call_id: call.id, status });
  } catch (e) {
    console.error("vaani webhook error", e);
    return NextResponse.json({ error: "internal" }, { status: 500 }); // 5xx → Vaani retries
  }
}

// End-to-end check against a real Postgres (local or Neon): replays the September calls through
// ingest → merge → grade → decision → emails → DB → dashboard queries. Gemini and Resend are
// stubbed (golden gradings; fake send), everything else is the production code path.
//   DATABASE_URL=postgres://… npm run test:e2e        (DESTRUCTIVE: truncates all tables)
import { SEPTEMBER } from "../lib/demo/september";
import { q } from "../lib/db";

const url = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) { console.error("Refusing to run: DATABASE_URL must be a LOCAL database (this test truncates tables)."); process.exit(2); }

const sent: { to: string; subject: string }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (String(input).includes("api.resend.com")) {
    const b = JSON.parse(String(init?.body));
    sent.push({ to: b.to[0], subject: b.subject });
    return new Response(JSON.stringify({ id: `fake-${sent.length}` }), { status: 200 });
  }
  return realFetch(input, init);
}) as typeof fetch;
process.env.RESEND_API_KEY = "test";

async function main() {
  const { ingestCall, mergeDropped } = await import("../lib/jobs/ingest");
  const { gradeCall } = await import("../lib/jobs/grade");
  const { listRecords } = await import("../lib/data/repo");
  const { computeMetrics, periodRange } = await import("../lib/metrics");
  const { getSettings } = await import("../lib/data/repo");
  const { emptyGrading } = await import("../lib/grading/gemini");
  const { classify } = await import("../lib/vaani/adapter");

  for (const t of ["cost_events","call_reports","handoffs","escalations","overrides","assessments","calls","callers","webhook_events"]) await q(`truncate ${t} cascade`);

  const golden = new Map(SEPTEMBER.map((c) => [`vaani-${c.label}`, c]));
  const grader = async (turns: unknown, ctx: { callDateIso: string }) => {
    const seed = [...golden.values()].find((c) => new Date(c.started_at).toISOString() === ctx.callDateIso)!;
    return { grading: structuredClone(seed.grading ?? emptyGrading()), model: "golden", inputTokens: 5000, outputTokens: 900 };
  };

  for (const c of SEPTEMBER) {
    const ev = { kind: "post_call" as const, event: "call_postprocessing", providerCallId: `vaani-${c.label}`, startedAt: new Date(c.started_at).toISOString(), durationSec: c.duration_sec, endReason: "user_hangup", transcript: c.transcript, recordingUrl: null, callerPhone: c.phone };
    const status = c.status === "answered" ? classify(ev) : c.status;
    const call = (await ingestCall({ providerCallId: ev.providerCallId, phone: c.phone, startedAt: ev.startedAt, durationSec: c.duration_sec, endReason: null, status: c.status, transcript: c.transcript, recordingUrl: null, raw: { label: c.label }, source: "webhook" }))!;
    if (status === "answered") await mergeDropped(call.id, c.phone, call.startedAt);
    await gradeCall(call.id, { grader: grader as never });
  }
  // idempotency: grading the same call again must not duplicate anything
  const any = (await q("select id from calls limit 1"))[0];
  await gradeCall(any.id, { grader: grader as never });

  const recs = await listRecords();
  const settings = await getSettings();
  const fails: string[] = [];
  const check = (name: string, ok: boolean, detail = "") => { console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`); if (!ok) fails.push(name); };

  const live = recs.filter((r) => !r.call.merged_into);
  check("20 enquiries + 1 merged dropped call stored", recs.length === 21 && live.length === 20, `${recs.length}/${live.length}`);
  const wrong = live.filter((r) => { const l = SEPTEMBER.find((s) => `vaani-${s.label}` === r.call.vaani_call_id)!; return r.assessment?.decision !== l.expected; });
  check("every decision matches the golden label", wrong.length === 0, wrong.map((r) => `${r.call.vaani_call_id}:${r.assessment?.decision}`).join(","));
  check("T17 dropped call merged into the redial", recs.find((r) => r.call.vaani_call_id === "vaani-T17a")?.call.merged_into === recs.find((r) => r.call.vaani_call_id === "vaani-T17b")?.call.id);
  check("a call report row for every graded enquiry", live.every((r) => r.report?.status === "sent"), `${live.filter((r) => r.report?.status === "sent").length}/20`);
  check("report goes to the configured address", live.every((r) => r.report?.to_email === settings.call_report_email));
  const q11 = live.filter((r) => ["QUALIFIED","QUALIFIED_WITH_NOTES"].includes(r.assessment!.decision));
  check("handoff email for each qualified lead (11), none otherwise", live.filter((r) => r.handoff).length === q11.length && q11.length === 11, `${live.filter((r) => r.handoff).length}`);
  check("no double sends: 21 reports (20 + the dropped call), 11 handoffs", (await q("select count(*)::int n from call_reports"))[0].n === 21 && (await q("select count(*)::int n from handoffs"))[0].n === 11);
  check("T09 escalation + escalation email", live.find((r) => r.call.vaani_call_id === "vaani-T09")?.escalation?.kind === "existing_client" && sent.some((s) => s.subject.startsWith("[ESCALATION")));
  check("T08 missed call queued for callback", live.find((r) => r.call.vaani_call_id === "vaani-T08")?.escalation?.kind === "callback");
  check("T16 service-recovery escalation", live.find((r) => r.call.vaani_call_id === "vaani-T16")?.escalation?.kind === "service_recovery");
  check("one current assessment per call", (await q("select count(*)::int n from (select call_id from assessments where is_current group by 1 having count(*) > 1) x"))[0].n === 0);
  check("cost ledger populated", (await q("select count(*)::int n from cost_events"))[0].n > 30);
  check("timestamps are ISO strings and JSON round-trips", typeof live[0].call.started_at === "string" && Array.isArray(live[0].call.transcript) && typeof live[0].assessment!.grading.summary === "string");
  const m = computeMetrics(recs, settings, periodRange("all", new Date()), new Date());
  check("dashboard metrics compute from DB rows", m.enquiries === 20 && m.qualified === 11 && m.cost.total > 0, `qualified ${m.qualified}, spend ₹${Math.round(m.cost.total)}`);
  console.log(`\n${sent.length} emails "sent" (stubbed). ${fails.length ? "FAILED: " + fails.join("; ") : "ALL CHECKS PASSED"}`);
  process.exit(fails.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });

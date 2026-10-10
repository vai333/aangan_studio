// GET /api/jobs/sweep — the safety net (Vercel Cron). Pulls recent calls from Vaani (in case a
// webhook was missed), retries grading that failed or never ran, re-sends failed emails.
// Protected by CRON_SECRET.
import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured, q } from "@/lib/db";
import { deliverHandoff, deliverReport, gradeCall } from "@/lib/jobs/grade";
import { callsNeedingHubspot, pushCallToHubspot } from "@/lib/hubspot/sync";
import { syncFromVaani } from "@/lib/vaani/sync";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ skipped: "demo mode" });
  const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

  const sync = await syncFromVaani({ pages: 2, grade: false });

  // A grading run that died mid-way (function timeout) is released for retry.
  await q("update calls set grade_status = 'failed', last_error = 'stuck in running' where grade_status = 'running' and created_at < $1", [ago(10)]);

  const posted = await q("select id from calls where grade_status in ('pending','failed') and grade_attempts < 3 and jsonb_array_length(transcript) > 0 and created_at < $1 limit 25", [ago(2)]);
  // Placeholders from call_ended with no transcript after 10 min → graded as missed/dropped.
  const bare = await q("select id from calls where grade_status = 'pending' and jsonb_array_length(transcript) = 0 and created_at < $1 limit 25", [ago(10)]);

  const results = { sync, graded: 0, failed: 0, emails: 0, hubspot: 0 };
  for (const c of [...posted, ...bare]) {
    try { await gradeCall(c.id); results.graded++; } catch { results.failed++; }
  }
  for (const h of await q("select id from handoffs where status in ('queued','failed') and attempts < 5 and created_at < $1 limit 25", [ago(2)])) { await deliverHandoff(h.id); results.emails++; }
  for (const r of await q("select id from call_reports where status in ('queued','failed') and attempts < 5 and created_at < $1 limit 25", [ago(2)])) { await deliverReport(r.id); results.emails++; }
  for (const id of await callsNeedingHubspot()) { const r = await pushCallToHubspot(id); if (r.status === "synced") results.hubspot++; }
  return NextResponse.json(results);
}

// POST /api/vaani/sync — import calls (with transcripts) from Vaani's Call History API.
// Auth: an admin session, or `Authorization: Bearer $CRON_SECRET` for scripts.
import { NextResponse, type NextRequest } from "next/server";
import { getSessionEmail } from "@/lib/auth";
import { dbConfigured } from "@/lib/db";
import { syncFromVaani } from "@/lib/vaani/sync";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const bearer = !!process.env.CRON_SECRET && req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  if (!bearer && !(await getSessionEmail())) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ error: "DATABASE_URL not set (demo mode)" }, { status: 503 });
  const pages = Math.min(10, Number(req.nextUrl.searchParams.get("pages") ?? 3));
  return NextResponse.json(await syncFromVaani({ pages }));
}

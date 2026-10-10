// POST /api/resend/webhook — bounce handling. Resend signs webhooks with Svix:
// base64(HMAC-SHA256(secret, "{svix-id}.{svix-timestamp}.{body}")).
import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured, q, q1 } from "@/lib/db";

export const runtime = "nodejs";

function verify(raw: string, h: Headers): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return false;
  const id = h.get("svix-id"), ts = h.get("svix-timestamp"), sigs = h.get("svix-signature");
  if (!id || !ts || !sigs || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${raw}`).digest("base64");
  return sigs.split(" ").some((s) => {
    const v = s.split(",")[1] ?? "";
    return v.length === expected.length && timingSafeEqual(Buffer.from(v), Buffer.from(expected));
  });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verify(raw, req.headers)) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  if (!dbConfigured()) return NextResponse.json({ skipped: "demo" });
  const evt = JSON.parse(raw);
  if (evt.type !== "email.bounced" && evt.type !== "email.complained") return NextResponse.json({ ignored: evt.type });

  const id = evt.data?.email_id;
  await q("update call_reports set status = 'bounced', last_error = $2 where provider_message_id = $1", [id, evt.type]);
  const h = await q1("update handoffs set status = 'bounced', last_error = $2 where provider_message_id = $1 returning call_id, designer_email", [id, evt.type]);
  if (h) {
    await q("insert into escalations (call_id, kind, reason) values ($1, 'callback', $2) on conflict (call_id, kind) do nothing",
      [h.call_id, `Handoff email to ${h.designer_email} bounced — reassign this lead`]);
  }
  return NextResponse.json({ ok: true });
}

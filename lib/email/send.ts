import "server-only";

// Transactional email via Resend's REST API. The Idempotency-Key means a retry
// after a timeout can never send the designer the same lead twice.
export async function sendEmail(msg: {
  to: string; cc?: string[]; subject: string; text: string; html: string; idempotencyKey: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Aangan Enquiry Desk <onboarding@resend.dev>";
  if (!key) return { ok: false, error: "RESEND_API_KEY not set" };

  let last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 500 * 4 ** (attempt - 1)));
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": msg.idempotencyKey },
        body: JSON.stringify({ from, to: [msg.to], cc: msg.cc?.length ? msg.cc : undefined, subject: msg.subject, text: msg.text, html: msg.html }),
        signal: AbortSignal.timeout(8000),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.id) return { ok: true, id: body.id };
      last = `${res.status} ${body.message ?? ""}`;
      if (res.status >= 400 && res.status < 500 && res.status !== 429) break; // not retryable
    } catch (e) {
      last = String(e);
    }
  }
  return { ok: false, error: last };
}

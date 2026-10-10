import { createHmac, timingSafeEqual } from "node:crypto";

// Signed, unguessable acknowledgement links. The link opens a confirm page
// (POST to acknowledge) so email link-scanners can't acknowledge by prefetching.
const secret = () => process.env.ACK_SECRET || "dev-only-ack-secret";

export function signAck(handoffId: string): string {
  const sig = createHmac("sha256", secret()).update(handoffId).digest("base64url").slice(0, 22);
  return `${handoffId}.${sig}`;
}

export function verifyAck(token: string): string | null {
  const [id, sig] = token.split(".");
  if (!id || !sig) return null;
  const expected = signAck(id).split(".")[1];
  const a = Buffer.from(sig), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

export const appUrl = () => (process.env.APP_URL || "http://localhost:3100").replace(/\/$/, "");

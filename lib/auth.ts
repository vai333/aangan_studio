import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// Admin sign-in without a third-party auth service:
//   ADMIN_EMAILS   comma-separated allow-list
//   ADMIN_PASSWORD shared password
//   SESSION_SECRET signs the cookie (falls back to ACK_SECRET)
// The cookie is HttpOnly, SameSite=Lax, Secure in production, and expires after 7 days.
export const COOKIE = "aangan_session";
const TTL_SEC = 7 * 24 * 3600;
const secret = () => process.env.SESSION_SECRET || process.env.ACK_SECRET || "dev-only-session-secret";
const sign = (s: string) => createHmac("sha256", secret()).update(s).digest("base64url");

const safeEq = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function checkLogin(email: string, password: string): boolean {
  const allowed = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || !allowed.length) return false;
  // evaluate both so timing doesn't reveal which one was wrong
  const okPw = safeEq(password, pw);
  const okEmail = allowed.includes(email.trim().toLowerCase());
  return okPw && okEmail;
}

export function makeSession(email: string): string {
  const body = Buffer.from(JSON.stringify({ e: email.trim().toLowerCase(), x: Math.floor(Date.now() / 1000) + TTL_SEC })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function readSession(value: string | undefined): string | null {
  if (!value) return null;
  const [body, sig] = value.split(".");
  if (!body || !sig || !safeEq(sig, sign(body))) return null;
  try {
    const { e, x } = JSON.parse(Buffer.from(body, "base64url").toString());
    return typeof e === "string" && x > Date.now() / 1000 ? e : null;
  } catch {
    return null;
  }
}

export async function getSessionEmail(): Promise<string | null> {
  return readSession((await cookies()).get(COOKIE)?.value);
}

export const cookieOptions = () => ({ httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: TTL_SEC });

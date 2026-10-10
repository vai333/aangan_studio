// Optimistic gate for /admin (Next 16 "proxy", formerly middleware): no session cookie → /login.
// The real check (signature + expiry) runs on the server in requireAdmin().
import { NextResponse, type NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  if (!process.env.DATABASE_URL || process.env.AANGAN_DEMO === "1") return NextResponse.next(); // demo mode
  if (!req.cookies.get("aangan_session")) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };

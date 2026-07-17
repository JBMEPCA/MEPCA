import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session-token";
import { db } from "@/lib/db";

// Gates the whole Hub: every request needs a valid, signed session cookie.
// The one exception is /api/inngest, excluded in the matcher below, because
// Inngest calls it from outside the browser and signs its own requests.

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const payload = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  // Confirm the account still exists and hasn't been disabled — this is what
  // makes the Accounts tab's "disable" take effect immediately. ~5 users, so
  // one primary-key lookup per request is nothing.
  let active = false;
  if (payload) {
    try {
      const user = await db.user.findUnique({
        where: { id: payload.userId },
        select: { active: true },
      });
      active = user?.active ?? false;
    } catch {
      // Database hiccup: trust the signed cookie rather than locking everyone out
      active = true;
    }
  }
  const authed = payload !== null && active;

  if (pathname === "/login") {
    // Already signed in? No need to see the login page again
    return authed ? NextResponse.redirect(new URL("/", req.nextUrl)) : NextResponse.next();
  }

  if (!authed) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  // Everything except static assets, images and the Inngest webhook
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/inngest|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)",
  ],
};

import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * One job: keep signed-in visitors off the public landing page.
 *
 * `/` is a statically prerendered marketing page (see
 * `src/app/(marketing)/page.tsx`) so that crawlers and cold visitors get
 * a cacheable 200 instead of the 307-to-`/sign-in` the dashboard used to
 * answer with. Someone who already has a session, though, expects `/` to
 * be their dashboard — this bounces them to `/dashboard`.
 *
 * NOT an auth gate. `getSessionCookie` only parses the cookie header; it
 * does not validate the token, hit the database, or check
 * `emailVerified`. A forged cookie buys nothing but a redirect into
 * `(app)/layout.tsx`, whose `requireCurrentUser()` remains the single
 * choke point that actually authenticates and bounces back to
 * `/sign-in`. Keeping the real check out of middleware is deliberate
 * (CVE-2025-29927 class of bypass: middleware is skippable by design in
 * a way a Server Component's `await auth.api.getSession()` is not).
 *
 * The matcher is exactly `/` and nothing else, so no other route pays
 * for this and the marketing page keeps its prerendered cache entry —
 * anonymous requests fall straight through to the static output.
 */
export function middleware(request: NextRequest) {
  if (getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/",
};

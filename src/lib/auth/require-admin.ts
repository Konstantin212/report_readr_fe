import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import { auth } from "./setup";
import { getCurrentUser } from "./server";

export type AdminSessionUser = {
  id: string;
  email: string;
  name?: string;
  role: "admin";
};

/**
 * Single enforced choke point for "is this session actually allowed into
 * the admin panel" (admin-panel design doc §4). Every admin-panel page
 * and every admin-panel API route must call `requireAdminUser()` /
 * `requireAdminApi()` (which both delegate here) independently — AC-2.5
 * — verified by the structural coverage test in
 * tests/admin/route-guard-coverage.test.ts.
 *
 * Order of checks matters:
 * 1. No session at all → not admin.
 * 2. Unverified email → not admin (mirrors the existing
 *    getCurrentUser()/AC-6 gate in server.ts — an admin account that
 *    somehow lost its verified state shouldn't get a free pass here).
 * 3. Impersonated session → not admin, structurally, regardless of the
 *    target's own role. This is the one piece of AC-5.5 that survives
 *    design doc §15's "full parity" resolution: an impersonated
 *    session's `session.user.role` IS the target's role (that's how
 *    better-auth's cookie-swap impersonation mechanism works), so even
 *    if the target happens to be an admin (already blocked from being
 *    impersonated in the first place by `allowImpersonatingAdmins:
 *    false` in setup.ts), this still explicitly refuses any
 *    impersonated session admin access — never a live bypass path.
 * 4. `role !== "admin"` → not admin. Default-deny (AC-1.3): NULL,
 *    "user", or any unrecognized future value are all equally
 *    non-admin. Admin status is opt-in only.
 */
export async function getAdminSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.email) return null; // signed out
  if (session.user.emailVerified === false) return null; // existing gate, unchanged
  if (session.session.impersonatedBy) return null; // AC-5.5 structural floor
  if (session.user.role !== "admin") return null; // AC-1.3 default-deny

  return session;
}

/**
 * Page guard (AC-2.1). Redirects away with no admin-panel content ever
 * rendered — not even a "forbidden" page that would confirm the route
 * exists. Layout-level use of this does NOT substitute for §2.5's
 * per-route-file requirement: Next.js layouts wrap same-segment pages
 * but not API routes, so every mutating API route below must also call
 * `requireAdminApi()` directly.
 */
export async function requireAdminUser(): Promise<AdminSessionUser> {
  const session = await getAdminSession();
  if (!session) {
    redirect("/");
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name ?? undefined,
    role: "admin",
  };
}

/**
 * API guard (AC-2.2/AC-2.3). 401 when there's no session at all
 * (signed-out visitor), 403 when signed in but not an admin — mirrors
 * the existing `requireAdmin()` 401-then-403 pattern in
 * src/app/api/admin/allowlist/route.ts, just keyed off the durable
 * `role` column instead of `isAdminEmail()`, plus the impersonation
 * floor above. This is the actual enforced security boundary for
 * non-page requests (e.g. curl straight at the API route) — the page
 * layout guard never runs for those.
 */
export type AppNavContext = {
  /** Gates the admin-panel nav link (AC-2.4). Never true for an
   *  impersonated session, even if the target's role is "admin" — same
   *  structural floor as getAdminSession(). */
  isAdmin: boolean;
  impersonation:
    | { active: true; targetEmail: string; targetName?: string }
    | { active: false };
};

/**
 * Cheap, non-redirecting read used by the main `(app)` layout for two
 * small nav-level UI decisions: showing/hiding the admin-panel link
 * (AC-2.4) and showing the "you're viewing this account as {target}"
 * impersonation banner (AC-5.2). Deliberately separate from
 * `getCurrentUser()`/`AppSessionUser` in server.ts — that type/its
 * existing callers and tests aren't touched by this feature.
 */
export async function getAppNavContext(): Promise<AppNavContext> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.email) {
    return { isAdmin: false, impersonation: { active: false } };
  }

  const impersonatedBy = session.session?.impersonatedBy;
  if (impersonatedBy) {
    return {
      isAdmin: false,
      impersonation: {
        active: true,
        targetEmail: session.user.email,
        targetName: session.user.name ?? undefined,
      },
    };
  }

  return {
    isAdmin: session.user.role === "admin",
    impersonation: { active: false },
  };
}

export async function requireAdminApi(): Promise<AdminSessionUser | NextResponse> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name ?? undefined,
    role: "admin",
  };
}

import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * admin-panel design doc §4. `getAdminSession()`/`requireAdminUser()`/
 * `requireAdminApi()` are the single enforced choke point every
 * admin-panel page and API route must call independently (AC-2.5) — see
 * tests/admin/route-guard-coverage.test.ts for the structural test that
 * every admin route file actually calls one of these.
 *
 * Critically, `getAdminSession()` must reject an *impersonated* session
 * even if the target happens to carry role "admin" — the product
 * decision in design doc §15 removes impersonation-specific action
 * gating everywhere EXCEPT this one structural floor: an impersonated
 * session can never reach the admin panel itself, because
 * `session.session.impersonatedBy` is checked before the role check.
 */

const mockGetSession = vi.fn();
const mockGetCurrentUser = vi.fn();
const mockRedirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});

vi.mock("@/lib/auth/setup", () => ({
  auth: { api: { getSession: mockGetSession } },
}));

vi.mock("@/lib/auth/server", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

function session(overrides: {
  role?: string | null;
  emailVerified?: boolean;
  impersonatedBy?: string | null;
  id?: string;
  email?: string;
  name?: string | null;
}) {
  return {
    user: {
      id: overrides.id ?? "admin-1",
      email: overrides.email ?? "admin@example.com",
      name: overrides.name ?? "Admin",
      emailVerified: overrides.emailVerified ?? true,
      role: "role" in overrides ? overrides.role : "admin",
    },
    session: {
      impersonatedBy: overrides.impersonatedBy ?? null,
    },
  };
}

describe("getAdminSession (AC-1.2/AC-1.3/AC-5.5-floor)", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockGetCurrentUser.mockReset();
    mockRedirect.mockClear();
  });

  it("returns the session for a verified, non-impersonated admin", async () => {
    mockGetSession.mockResolvedValue(session({}));
    const { getAdminSession } = await import("@/lib/auth/require-admin");
    await expect(getAdminSession()).resolves.not.toBeNull();
  });

  it("returns null when signed out", async () => {
    mockGetSession.mockResolvedValue(null);
    const { getAdminSession } = await import("@/lib/auth/require-admin");
    await expect(getAdminSession()).resolves.toBeNull();
  });

  it("returns null when the session's email is unverified (existing gate, unchanged)", async () => {
    mockGetSession.mockResolvedValue(session({ emailVerified: false }));
    const { getAdminSession } = await import("@/lib/auth/require-admin");
    await expect(getAdminSession()).resolves.toBeNull();
  });

  it("returns null for a non-admin role (default-deny, AC-1.3)", async () => {
    mockGetSession.mockResolvedValue(session({ role: "user" }));
    const { getAdminSession } = await import("@/lib/auth/require-admin");
    await expect(getAdminSession()).resolves.toBeNull();
  });

  it("returns null when role is null/unset (default-deny, AC-1.3)", async () => {
    mockGetSession.mockResolvedValue(session({ role: null }));
    const { getAdminSession } = await import("@/lib/auth/require-admin");
    await expect(getAdminSession()).resolves.toBeNull();
  });

  it("returns null for an impersonated session even when the target's role is 'admin' (AC-5.5 structural floor)", async () => {
    mockGetSession.mockResolvedValue(session({ role: "admin", impersonatedBy: "some-admin-id" }));
    const { getAdminSession } = await import("@/lib/auth/require-admin");
    await expect(getAdminSession()).resolves.toBeNull();
  });
});

describe("requireAdminUser (AC-2.1 — page guard)", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockGetCurrentUser.mockReset();
    mockRedirect.mockClear();
  });

  it("returns an AdminSessionUser for a valid admin session", async () => {
    mockGetSession.mockResolvedValue(session({ id: "a1", email: "a@example.com", name: "A" }));
    const { requireAdminUser } = await import("@/lib/auth/require-admin");
    await expect(requireAdminUser()).resolves.toEqual({
      id: "a1",
      email: "a@example.com",
      name: "A",
      role: "admin",
    });
  });

  it("redirects to / (never renders panel content) for a non-admin", async () => {
    mockGetSession.mockResolvedValue(session({ role: "user" }));
    const { requireAdminUser } = await import("@/lib/auth/require-admin");
    await expect(requireAdminUser()).rejects.toThrow("REDIRECT:/");
  });

  it("redirects to / when signed out", async () => {
    mockGetSession.mockResolvedValue(null);
    const { requireAdminUser } = await import("@/lib/auth/require-admin");
    await expect(requireAdminUser()).rejects.toThrow("REDIRECT:/");
  });
});

describe("requireAdminApi (AC-2.2/AC-2.3 — 401-then-403 API guard)", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockGetCurrentUser.mockReset();
    mockRedirect.mockClear();
  });

  it("returns 401 when there is no session at all (signed out)", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    mockGetSession.mockResolvedValue(null);
    const { requireAdminApi } = await import("@/lib/auth/require-admin");
    const result = await requireAdminApi();
    expect(result).not.toHaveProperty("role");
    const res = result as Response;
    expect(res.status).toBe(401);
  });

  it("returns 403 when signed in but not an admin", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "u1", email: "user@example.com" });
    mockGetSession.mockResolvedValue(session({ role: "user", id: "u1", email: "user@example.com" }));
    const { requireAdminApi } = await import("@/lib/auth/require-admin");
    const result = await requireAdminApi();
    const res = result as Response;
    expect(res.status).toBe(403);
  });

  it("returns 403 for an impersonated session even if role is 'admin' (AC-5.5 structural floor, enforced at the actual boundary)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "u1", email: "target@example.com" });
    mockGetSession.mockResolvedValue(
      session({ role: "admin", impersonatedBy: "admin-id", id: "u1", email: "target@example.com" }),
    );
    const { requireAdminApi } = await import("@/lib/auth/require-admin");
    const result = await requireAdminApi();
    const res = result as Response;
    expect(res.status).toBe(403);
  });

  it("returns an AdminSessionUser for a genuine admin", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "a1", email: "a@example.com" });
    mockGetSession.mockResolvedValue(session({ id: "a1", email: "a@example.com", name: "A" }));
    const { requireAdminApi } = await import("@/lib/auth/require-admin");
    await expect(requireAdminApi()).resolves.toEqual({
      id: "a1",
      email: "a@example.com",
      name: "A",
      role: "admin",
    });
  });
});

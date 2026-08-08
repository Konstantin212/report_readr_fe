import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * `getAppNavContext()` backs AC-2.4 (hide the admin nav entry from
 * non-admins) and AC-5.2 (impersonation banner data) — a single small
 * read used by the main `(app)` layout, deliberately separate from
 * `getCurrentUser()`/`AppSessionUser` (server.ts) so that type's shape
 * (and the tests pinning it with `.toEqual`) stays untouched.
 */
const mockGetSession = vi.fn();

vi.mock("@/lib/auth/setup", () => ({
  auth: { api: { getSession: mockGetSession } },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

describe("getAppNavContext", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
  });

  it("returns isAdmin=false, impersonation inactive when signed out", async () => {
    mockGetSession.mockResolvedValue(null);
    const { getAppNavContext } = await import("@/lib/auth/require-admin");
    await expect(getAppNavContext()).resolves.toEqual({
      isAdmin: false,
      impersonation: { active: false },
    });
  });

  it("returns isAdmin=true for an ordinary (non-impersonated) admin session", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "a1", email: "admin@example.com", name: "Admin", role: "admin" },
      session: { impersonatedBy: null },
    });
    const { getAppNavContext } = await import("@/lib/auth/require-admin");
    await expect(getAppNavContext()).resolves.toEqual({
      isAdmin: true,
      impersonation: { active: false },
    });
  });

  it("returns isAdmin=false for an ordinary non-admin session", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", email: "user@example.com", name: "User", role: "user" },
      session: { impersonatedBy: null },
    });
    const { getAppNavContext } = await import("@/lib/auth/require-admin");
    await expect(getAppNavContext()).resolves.toEqual({
      isAdmin: false,
      impersonation: { active: false },
    });
  });

  it("reports active impersonation with the target's identity, and isAdmin=false even if the target's role happens to be admin", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "t1", email: "target@example.com", name: "Target", role: "admin" },
      session: { impersonatedBy: "admin-1" },
    });
    const { getAppNavContext } = await import("@/lib/auth/require-admin");
    await expect(getAppNavContext()).resolves.toEqual({
      isAdmin: false,
      impersonation: { active: true, targetEmail: "target@example.com", targetName: "Target" },
    });
  });

  it("tolerates a session shape with no session.session sub-object (defensive)", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", email: "user@example.com", role: "user" },
    });
    const { getAppNavContext } = await import("@/lib/auth/require-admin");
    await expect(getAppNavContext()).resolves.toEqual({
      isAdmin: false,
      impersonation: { active: false },
    });
  });
});

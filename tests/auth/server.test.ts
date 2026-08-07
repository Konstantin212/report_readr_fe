import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetSession = vi.fn();
const mockRedirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});

vi.mock("@/lib/auth/setup", () => ({
  auth: { api: { getSession: mockGetSession } },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

/**
 * AC-6: `requireCurrentUser()`'s single choke point must also check
 * `emailVerified`, not just session existence — closing the
 * grandfathered-session gap (a session created before this feature
 * shipped, or one that slips through some other path). See design doc
 * §6.
 */
describe("getCurrentUser / requireCurrentUser (AC-6)", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockRedirect.mockClear();
  });

  it("returns the user when the session exists and emailVerified is true", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", email: "verified@example.com", name: "V", emailVerified: true },
    });
    const { getCurrentUser } = await import("@/lib/auth/server");

    await expect(getCurrentUser()).resolves.toEqual({
      id: "u1",
      email: "verified@example.com",
      name: "V",
    });
  });

  it("returns null when the session exists but emailVerified is false", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u2", email: "unverified@example.com", name: "U", emailVerified: false },
    });
    const { getCurrentUser } = await import("@/lib/auth/server");

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("returns null when there is no session at all", async () => {
    mockGetSession.mockResolvedValue(null);
    const { getCurrentUser } = await import("@/lib/auth/server");

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("requireCurrentUser() redirects to /sign-in for an unverified session, same as no session", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u3", email: "unverified@example.com", name: "U", emailVerified: false },
    });
    const { requireCurrentUser } = await import("@/lib/auth/server");

    await expect(requireCurrentUser()).rejects.toThrow("REDIRECT:/sign-in");
  });

  it("requireCurrentUser() returns the user for a verified session", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u4", email: "verified@example.com", name: "V", emailVerified: true },
    });
    const { requireCurrentUser } = await import("@/lib/auth/server");

    await expect(requireCurrentUser()).resolves.toEqual({
      id: "u4",
      email: "verified@example.com",
      name: "V",
    });
  });
});

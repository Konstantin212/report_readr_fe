import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for the two impersonation routes (design doc §8.1/§8.4),
 * mocking every collaborator so these run without a live DB — the
 * real-DB-integration convention (tests/data/*.test.ts) doesn't fit
 * here since these routes also call better-auth's plugin endpoints and
 * forward Set-Cookie headers, which aren't meaningfully DB-shaped.
 */

const { mockRequireAdminApi } = vi.hoisted(() => ({ mockRequireAdminApi: vi.fn() }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdminApi: mockRequireAdminApi }));

const { mockGetSession, mockImpersonateUser, mockStopImpersonating } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockImpersonateUser: vi.fn(),
  mockStopImpersonating: vi.fn(),
}));
vi.mock("@/lib/auth/setup", () => ({
  auth: {
    api: {
      getSession: mockGetSession,
      impersonateUser: mockImpersonateUser,
      stopImpersonating: mockStopImpersonating,
    },
  },
}));

const { mockWriteAuditLog } = vi.hoisted(() => ({ mockWriteAuditLog: vi.fn() }));
vi.mock("@/lib/data/admin-audit-log", () => ({ writeAuditLog: mockWriteAuditLog }));

const { mockDbSelectResult, fakeDb } = vi.hoisted(() => {
  const state = { result: [] as unknown[] };
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: async () => state.result,
    then: (resolve: (v: unknown) => void) => resolve(state.result),
  };
  return { mockDbSelectResult: state, fakeDb: chain };
});
vi.mock("@/lib/db/client", () => ({ getDb: () => fakeDb }));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

function fakeAdmin(overrides: Partial<{ id: string; email: string }> = {}) {
  return { id: overrides.id ?? "admin-1", email: overrides.email ?? "admin@example.com", role: "admin" as const };
}

beforeEach(() => {
  mockRequireAdminApi.mockReset();
  mockGetSession.mockReset();
  mockImpersonateUser.mockReset();
  mockStopImpersonating.mockReset();
  mockWriteAuditLog.mockReset();
  mockWriteAuditLog.mockResolvedValue({ id: "audit-1" });
  mockDbSelectResult.result = [];
});

afterEach(() => {
  vi.resetModules();
});

describe("POST /api/admin/panel/users/[id]/impersonate (AC-5.1/5.7)", () => {
  it("rejects self-impersonation (400) without touching the DB or the plugin", async () => {
    mockRequireAdminApi.mockResolvedValue(fakeAdmin({ id: "admin-1" }));
    const { POST } = await import("@/app/api/admin/panel/users/[id]/impersonate/route");
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ id: "admin-1" }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("SELF");
    expect(mockImpersonateUser).not.toHaveBeenCalled();
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });

  it("returns 404 when the target doesn't exist", async () => {
    mockRequireAdminApi.mockResolvedValue(fakeAdmin({ id: "admin-1" }));
    mockDbSelectResult.result = [];
    const { POST } = await import("@/app/api/admin/panel/users/[id]/impersonate/route");
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ id: "no-such-user" }) });
    expect(res.status).toBe(404);
  });

  it("writes IMPERSONATION_START before calling the plugin, and forwards Set-Cookie headers on success", async () => {
    mockRequireAdminApi.mockResolvedValue(fakeAdmin({ id: "admin-1", email: "admin@example.com" }));
    mockDbSelectResult.result = [{ email: "target@example.com" }];
    const pluginResponse = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "set-cookie": "better-auth.session_token=abc; Path=/" },
    });
    mockImpersonateUser.mockResolvedValue(pluginResponse);

    const { POST } = await import("@/app/api/admin/panel/users/[id]/impersonate/route");
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ id: "target-1" }) });

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "IMPERSONATION_START",
        adminUserId: "admin-1",
        targetUserId: "target-1",
        targetEmailSnapshot: "target@example.com",
      }),
    );
    expect(mockImpersonateUser).toHaveBeenCalledWith(
      expect.objectContaining({ body: { userId: "target-1" }, asResponse: true }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("better-auth.session_token=abc");
  });
});

describe("POST /api/admin/panel/impersonate/stop (AC-5.4)", () => {
  it("rejects with 400 when the session isn't impersonating anyone", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", email: "user@example.com" },
      session: { impersonatedBy: null },
    });
    const { POST } = await import("@/app/api/admin/panel/impersonate/stop/route");
    const res = await POST();
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("NOT_IMPERSONATING");
    expect(mockStopImpersonating).not.toHaveBeenCalled();
  });

  it("calls stopImpersonating, writes an IMPERSONATION_END row, and forwards Set-Cookie headers on success", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "target-1", email: "target@example.com" },
      session: { impersonatedBy: "admin-1" },
    });
    mockDbSelectResult.result = [{ email: "admin@example.com" }];
    const pluginResponse = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "set-cookie": "better-auth.session_token=restored; Path=/" },
    });
    mockStopImpersonating.mockResolvedValue(pluginResponse);

    const { POST } = await import("@/app/api/admin/panel/impersonate/stop/route");
    const res = await POST();

    expect(mockStopImpersonating).toHaveBeenCalled();
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "IMPERSONATION_END",
        adminUserId: "admin-1",
        targetUserId: "target-1",
        detail: { endReason: "EXITED" },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("better-auth.session_token=restored");
  });
});

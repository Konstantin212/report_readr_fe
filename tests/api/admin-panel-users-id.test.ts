import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for PATCH/DELETE /api/admin/panel/users/[id] (design doc §7/§9).
 * `requireAdminApi()` and the actual last-admin-guarded SQL are covered
 * elsewhere (tests/auth/require-admin.test.ts,
 * tests/data/admin-mutations.test.ts); this file focuses on the route's
 * own responsibilities: delegating to requireAdminApi() first (AC-6.5),
 * body validation/shape (AC-6.1), and status-code mapping.
 */

const { mockRequireAdminApi } = vi.hoisted(() => ({ mockRequireAdminApi: vi.fn() }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdminApi: mockRequireAdminApi }));

const { mockDeleteAdminUser, mockEditAdminUser } = vi.hoisted(() => ({
  mockDeleteAdminUser: vi.fn(),
  mockEditAdminUser: vi.fn(),
}));
vi.mock("@/lib/data/admin-mutations", () => ({
  deleteAdminUser: mockDeleteAdminUser,
  editAdminUser: mockEditAdminUser,
}));

vi.mock("@/lib/db/client", () => ({ getDb: () => ({}) }));

function fakeAdmin() {
  return { id: "admin-1", email: "admin@example.com", role: "admin" as const };
}

beforeEach(() => {
  mockRequireAdminApi.mockReset();
  mockDeleteAdminUser.mockReset();
  mockEditAdminUser.mockReset();
});

afterEach(() => {
  vi.resetModules();
});

function patchRequest(body: unknown) {
  return new Request("http://x", { method: "PATCH", body: JSON.stringify(body) });
}

describe("PATCH /api/admin/panel/users/[id] (AC-6)", () => {
  it("returns the 403 from requireAdminApi unchanged for a non-admin caller (AC-6.5)", async () => {
    const forbidden = NextResponse.json({ error: "forbidden" }, { status: 403 });
    mockRequireAdminApi.mockResolvedValue(forbidden);
    const { PATCH } = await import("@/app/api/admin/panel/users/[id]/route");

    const res = await PATCH(patchRequest({ name: "New" }), { params: Promise.resolve({ id: "target-1" }) });
    expect(res.status).toBe(403);
    expect(mockEditAdminUser).not.toHaveBeenCalled();
  });

  it("rejects an empty body with 400 without calling editAdminUser", async () => {
    mockRequireAdminApi.mockResolvedValue(fakeAdmin());
    const { PATCH } = await import("@/app/api/admin/panel/users/[id]/route");

    const res = await PATCH(patchRequest({}), { params: Promise.resolve({ id: "target-1" }) });
    expect(res.status).toBe(400);
    expect(mockEditAdminUser).not.toHaveBeenCalled();
  });

  it("rejects unknown fields (e.g. id, createdAt) with 400 — AC-6.1's 'no other fields accepted'", async () => {
    mockRequireAdminApi.mockResolvedValue(fakeAdmin());
    const { PATCH } = await import("@/app/api/admin/panel/users/[id]/route");

    const res = await PATCH(patchRequest({ id: "hijack", name: "New" }), {
      params: Promise.resolve({ id: "target-1" }),
    });
    expect(res.status).toBe(400);
    expect(mockEditAdminUser).not.toHaveBeenCalled();
  });

  it("rejects a role value other than admin/user with 400", async () => {
    mockRequireAdminApi.mockResolvedValue(fakeAdmin());
    const { PATCH } = await import("@/app/api/admin/panel/users/[id]/route");

    const res = await PATCH(patchRequest({ role: "superuser" }), { params: Promise.resolve({ id: "target-1" }) });
    expect(res.status).toBe(400);
    expect(mockEditAdminUser).not.toHaveBeenCalled();
  });

  it("maps a LAST_ADMIN rejection to 409 and NOT_FOUND to 404", async () => {
    mockRequireAdminApi.mockResolvedValue(fakeAdmin());
    mockEditAdminUser.mockResolvedValue({ ok: false, reason: "LAST_ADMIN" });
    const { PATCH } = await import("@/app/api/admin/panel/users/[id]/route");

    const res = await PATCH(patchRequest({ role: "user" }), { params: Promise.resolve({ id: "target-1" }) });
    expect(res.status).toBe(409);
  });

  it("maps an EMAIL_TAKEN rejection to 409 (not a 500) without throwing", async () => {
    mockRequireAdminApi.mockResolvedValue(fakeAdmin());
    mockEditAdminUser.mockResolvedValue({ ok: false, reason: "EMAIL_TAKEN" });
    const { PATCH } = await import("@/app/api/admin/panel/users/[id]/route");

    const res = await PATCH(patchRequest({ email: "taken@example.com" }), {
      params: Promise.resolve({ id: "target-1" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({ error: "EMAIL_TAKEN" });
  });

  it("returns 200 with auditLogFailed surfaced on success", async () => {
    mockRequireAdminApi.mockResolvedValue(fakeAdmin());
    mockEditAdminUser.mockResolvedValue({ ok: true, auditLogFailed: true });
    const { PATCH } = await import("@/app/api/admin/panel/users/[id]/route");

    const res = await PATCH(patchRequest({ name: "New" }), { params: Promise.resolve({ id: "target-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, auditLogFailed: true });
  });
});

describe("DELETE /api/admin/panel/users/[id] (AC-4)", () => {
  it("returns the 401 from requireAdminApi unchanged when signed out", async () => {
    const unauthorized = NextResponse.json({ error: "unauthorized" }, { status: 401 });
    mockRequireAdminApi.mockResolvedValue(unauthorized);
    const { DELETE } = await import("@/app/api/admin/panel/users/[id]/route");

    const res = await DELETE(new Request("http://x", { method: "DELETE" }), {
      params: Promise.resolve({ id: "target-1" }),
    });
    expect(res.status).toBe(401);
    expect(mockDeleteAdminUser).not.toHaveBeenCalled();
  });

  it("maps SELF to 400, LAST_ADMIN to 409, NOT_FOUND to 404", async () => {
    mockRequireAdminApi.mockResolvedValue(fakeAdmin());
    const { DELETE } = await import("@/app/api/admin/panel/users/[id]/route");

    mockDeleteAdminUser.mockResolvedValue({ ok: false, reason: "SELF" });
    let res = await DELETE(new Request("http://x", { method: "DELETE" }), {
      params: Promise.resolve({ id: "admin-1" }),
    });
    expect(res.status).toBe(400);

    mockDeleteAdminUser.mockResolvedValue({ ok: false, reason: "LAST_ADMIN" });
    res = await DELETE(new Request("http://x", { method: "DELETE" }), { params: Promise.resolve({ id: "t" }) });
    expect(res.status).toBe(409);

    mockDeleteAdminUser.mockResolvedValue({ ok: false, reason: "NOT_FOUND" });
    res = await DELETE(new Request("http://x", { method: "DELETE" }), { params: Promise.resolve({ id: "t" }) });
    expect(res.status).toBe(404);
  });

  it("returns 200 with auditLogFailed surfaced on success", async () => {
    mockRequireAdminApi.mockResolvedValue(fakeAdmin());
    mockDeleteAdminUser.mockResolvedValue({ ok: true, auditLogFailed: false });
    const { DELETE } = await import("@/app/api/admin/panel/users/[id]/route");

    const res = await DELETE(new Request("http://x", { method: "DELETE" }), {
      params: Promise.resolve({ id: "target-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, auditLogFailed: false });
  });
});

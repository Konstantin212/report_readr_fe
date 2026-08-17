import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetCurrentUser } = vi.hoisted(() => ({ mockGetCurrentUser: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ getCurrentUser: mockGetCurrentUser }));

const { mockSendEmail } = vi.hoisted(() => ({ mockSendEmail: vi.fn() }));
vi.mock("@/lib/email/resend", () => ({ sendEmail: mockSendEmail }));

const { mockAllowFeedback } = vi.hoisted(() => ({ mockAllowFeedback: vi.fn() }));
vi.mock("@/lib/feedback/rate-limit", () => ({ allowFeedback: mockAllowFeedback }));

const ORIGINAL_TO = process.env.FEEDBACK_TO_EMAIL;

function postRequest(body: unknown) {
  return new Request("http://x/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  mockGetCurrentUser.mockReset();
  mockSendEmail.mockReset().mockResolvedValue(undefined);
  mockAllowFeedback.mockReset().mockReturnValue(true);
  process.env.FEEDBACK_TO_EMAIL = "support@ptfolio.net";
});

afterEach(() => {
  vi.resetModules();
  if (ORIGINAL_TO === undefined) delete process.env.FEEDBACK_TO_EMAIL;
  else process.env.FEEDBACK_TO_EMAIL = ORIGINAL_TO;
});

describe("POST /api/feedback", () => {
  it("401 when not signed in; does not send", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const { POST } = await import("@/app/api/feedback/route");
    const res = await POST(postRequest({ category: "bug", message: "hi" }));
    expect(res.status).toBe(401);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("429 when the rate limiter rejects; does not send", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "u1", email: "j@x.com" });
    mockAllowFeedback.mockReturnValue(false);
    const { POST } = await import("@/app/api/feedback/route");
    const res = await POST(postRequest({ category: "bug", message: "hi" }));
    expect(res.status).toBe(429);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("400 on malformed JSON", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "u1", email: "j@x.com" });
    const { POST } = await import("@/app/api/feedback/route");
    const res = await POST(postRequest("not json"));
    expect(res.status).toBe(400);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("400 on invalid body (bad category / empty message)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "u1", email: "j@x.com" });
    const { POST } = await import("@/app/api/feedback/route");
    const res = await POST(postRequest({ category: "nope", message: "" }));
    expect(res.status).toBe(400);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("200 on success; sends one email with correct to/replyTo/subject", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "u1", email: "jane@x.com", name: "Jane" });
    const { POST } = await import("@/app/api/feedback/route");
    const res = await POST(postRequest({ category: "bug", message: "it broke" }));
    expect(res.status).toBe(200);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const arg = mockSendEmail.mock.calls[0][0];
    expect(arg.to).toBe("support@ptfolio.net");
    expect(arg.replyTo).toBe("jane@x.com");
    expect(arg.subject).toBe("[Bug] Feedback from Jane");
  });

  it("does not pass the raw message as unescaped HTML", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "u1", email: "j@x.com", name: "J" });
    const { POST } = await import("@/app/api/feedback/route");
    await POST(postRequest({ category: "other", message: "<script>x</script>" }));
    expect(mockSendEmail.mock.calls[0][0].html).not.toContain("<script>");
  });

  it("500 when sending fails", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "u1", email: "j@x.com" });
    mockSendEmail.mockRejectedValue(new Error("resend down"));
    const { POST } = await import("@/app/api/feedback/route");
    const res = await POST(postRequest({ category: "bug", message: "hi" }));
    expect(res.status).toBe(500);
  });
});

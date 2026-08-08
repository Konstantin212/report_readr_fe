import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();
const ResendCtorMock = vi.fn().mockImplementation((apiKey: string) => ({
  __apiKey: apiKey,
  emails: { send: sendMock },
}));

vi.mock("resend", () => ({
  Resend: ResendCtorMock,
}));

const ORIGINAL_API_KEY = process.env.RESEND_API_KEY;
const ORIGINAL_FROM_EMAIL = process.env.RESEND_FROM_EMAIL;

async function importFresh() {
  vi.resetModules();
  return import("@/lib/email/resend");
}

beforeEach(() => {
  sendMock.mockReset();
  ResendCtorMock.mockClear();
  process.env.RESEND_API_KEY = "test-api-key";
  process.env.RESEND_FROM_EMAIL = "Folio <no-reply@mail.ptfolio.net>";
});

afterEach(() => {
  if (ORIGINAL_API_KEY === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = ORIGINAL_API_KEY;
  if (ORIGINAL_FROM_EMAIL === undefined) delete process.env.RESEND_FROM_EMAIL;
  else process.env.RESEND_FROM_EMAIL = ORIGINAL_FROM_EMAIL;
});

describe("getResendClient", () => {
  it("lazily constructs a single Resend client from RESEND_API_KEY", async () => {
    const { getResendClient } = await importFresh();

    const first = getResendClient();
    const second = getResendClient();

    expect(ResendCtorMock).toHaveBeenCalledTimes(1);
    expect(ResendCtorMock).toHaveBeenCalledWith("test-api-key");
    expect(first).toBe(second);
  });

  it("throws if RESEND_API_KEY is not set", async () => {
    delete process.env.RESEND_API_KEY;
    const { getResendClient } = await importFresh();

    expect(() => getResendClient()).toThrow(/RESEND_API_KEY/);
  });
});

describe("sendEmail", () => {
  it("sends via the Resend SDK using RESEND_FROM_EMAIL as the sender", async () => {
    sendMock.mockResolvedValue({ data: { id: "email_123" }, error: null });
    const { sendEmail } = await importFresh();

    await sendEmail({ to: "user@example.com", subject: "Hello", html: "<p>Hi</p>" });

    expect(sendMock).toHaveBeenCalledWith({
      from: "Folio <no-reply@mail.ptfolio.net>",
      to: "user@example.com",
      subject: "Hello",
      html: "<p>Hi</p>",
    });
  });

  it("throws (does not swallow) when Resend returns an error", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { message: "domain not verified", statusCode: 403, name: "invalid_from_address" },
    });
    const { sendEmail } = await importFresh();

    await expect(
      sendEmail({ to: "user@example.com", subject: "Hello", html: "<p>Hi</p>" }),
    ).rejects.toThrow(/domain not verified/);
  });

  it("throws if RESEND_FROM_EMAIL is not set", async () => {
    delete process.env.RESEND_FROM_EMAIL;
    const { sendEmail } = await importFresh();

    await expect(
      sendEmail({ to: "user@example.com", subject: "Hello", html: "<p>Hi</p>" }),
    ).rejects.toThrow(/RESEND_FROM_EMAIL/);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("propagates unexpected SDK rejection instead of swallowing it", async () => {
    sendMock.mockRejectedValue(new Error("network down"));
    const { sendEmail } = await importFresh();

    await expect(
      sendEmail({ to: "user@example.com", subject: "Hello", html: "<p>Hi</p>" }),
    ).rejects.toThrow(/network down/);
  });
});

describe("sendEmail replyTo", () => {
  it("passes replyTo through to Resend when provided", async () => {
    sendMock.mockResolvedValue({ data: { id: "x" }, error: null });
    const { sendEmail } = await importFresh();
    await sendEmail({ to: "a@b.c", subject: "s", html: "<p>h</p>", replyTo: "user@x.com" });
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ replyTo: "user@x.com" }));
  });

  it("omits replyTo when not provided", async () => {
    sendMock.mockResolvedValue({ data: { id: "x" }, error: null });
    const { sendEmail } = await importFresh();
    await sendEmail({ to: "a@b.c", subject: "s", html: "<p>h</p>" });
    expect(sendMock.mock.calls[0][0].replyTo).toBeUndefined();
  });
});

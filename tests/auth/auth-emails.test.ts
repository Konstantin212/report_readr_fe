import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.hoisted` is the documented-safe way to share a variable with a
// `vi.mock` factory: `vi.mock` calls are hoisted above all imports (and
// above ordinary top-level statements), so a plain
// `const mockSendEmail = vi.fn()` above it relies on Vitest's
// name-starts-with-"mock" hoisting heuristic to *also* hoist that
// declaration — which turned out to be unreliable when this file is
// collected in the same run as other test files with a large transitive
// module graph (e.g. tests/api/cron/auth-cleanup.test.ts, which pulls in
// the full db schema): it intermittently threw "Cannot access
// 'mockSendEmail' before initialization" (a TDZ violation) even though
// this exact file passed in isolation. `vi.hoisted` sidesteps the
// heuristic entirely by explicitly hoisting the initializer itself.
const { mockSendEmail } = vi.hoisted(() => ({ mockSendEmail: vi.fn() }));

vi.mock("@/lib/email/resend", () => ({
  sendEmail: mockSendEmail,
}));

import {
  sendResetPasswordEmail,
  sendVerificationEmail,
} from "@/lib/auth/auth-emails";

const sendEmailMock = mockSendEmail;

beforeEach(() => {
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("sendVerificationEmail", () => {
  it("sends to the user's email with the verification url linked in the body", async () => {
    await sendVerificationEmail({
      user: { email: "new-user@example.com", name: "New User" },
      url: "https://ptfolio.net/api/auth/verify-email?token=abc123",
    });

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0][0];
    expect(call.to).toBe("new-user@example.com");
    expect(call.subject).toMatch(/verify/i);
    expect(call.html).toContain("https://ptfolio.net/api/auth/verify-email?token=abc123");
  });

  it("propagates a send failure instead of swallowing it (caller must know)", async () => {
    sendEmailMock.mockRejectedValue(new Error("Resend is down"));

    await expect(
      sendVerificationEmail({
        user: { email: "new-user@example.com", name: "New User" },
        url: "https://ptfolio.net/verify",
      }),
    ).rejects.toThrow(/Resend is down/);
  });
});

describe("sendResetPasswordEmail", () => {
  it("sends to the user's email with the reset url linked in the body", async () => {
    await sendResetPasswordEmail({
      user: { email: "forgetful@example.com", name: "Forgetful" },
      url: "https://ptfolio.net/reset-password/tok123",
    });

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0][0];
    expect(call.to).toBe("forgetful@example.com");
    expect(call.subject).toMatch(/reset|password/i);
    expect(call.html).toContain("https://ptfolio.net/reset-password/tok123");
  });

  it("propagates a send failure instead of swallowing it", async () => {
    sendEmailMock.mockRejectedValue(new Error("Resend is down"));

    await expect(
      sendResetPasswordEmail({
        user: { email: "forgetful@example.com", name: "Forgetful" },
        url: "https://ptfolio.net/reset-password/tok123",
      }),
    ).rejects.toThrow(/Resend is down/);
  });
});

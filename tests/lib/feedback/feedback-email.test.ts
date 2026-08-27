import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { feedbackSchema, composeFeedbackEmail } from "@/lib/feedback/feedback-email";

const ORIGINAL = process.env.FEEDBACK_TO_EMAIL;
beforeEach(() => { process.env.FEEDBACK_TO_EMAIL = "support@ptfolio.net"; });
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.FEEDBACK_TO_EMAIL;
  else process.env.FEEDBACK_TO_EMAIL = ORIGINAL;
});

describe("feedbackSchema", () => {
  it("accepts a valid submission", () => {
    expect(feedbackSchema.safeParse({ category: "bug", message: "hi" }).success).toBe(true);
  });
  it("rejects an unknown category", () => {
    expect(feedbackSchema.safeParse({ category: "spam", message: "hi" }).success).toBe(false);
  });
  it("rejects a whitespace-only message", () => {
    expect(feedbackSchema.safeParse({ category: "bug", message: "   " }).success).toBe(false);
  });
  it("rejects an over-length message", () => {
    expect(feedbackSchema.safeParse({ category: "bug", message: "x".repeat(5001) }).success).toBe(false);
  });

  it("treats blank subject/contactEmail as absent rather than invalid", () => {
    const parsed = feedbackSchema.safeParse({
      category: "bug",
      message: "hi",
      subject: "   ",
      contactEmail: "",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.subject).toBeUndefined();
    expect(parsed.success && parsed.data.contactEmail).toBeUndefined();
  });

  it("rejects a malformed contact email", () => {
    expect(
      feedbackSchema.safeParse({ category: "bug", message: "hi", contactEmail: "nope" }).success,
    ).toBe(false);
  });

  it("rejects an over-length subject", () => {
    expect(
      feedbackSchema.safeParse({ category: "bug", message: "hi", subject: "x".repeat(151) })
        .success,
    ).toBe(false);
  });

  it("collapses CR/LF in the subject so headers cannot be injected", () => {
    const parsed = feedbackSchema.safeParse({
      category: "bug",
      message: "hi",
      subject: "hello\r\nBcc: attacker@evil.com",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.subject).toBe("hello Bcc: attacker@evil.com");
  });
});

describe("composeFeedbackEmail", () => {
  const user = { id: "u1", email: "jane@example.com", name: "Jane" };

  it("throws when FEEDBACK_TO_EMAIL is unset", () => {
    delete process.env.FEEDBACK_TO_EMAIL;
    expect(() => composeFeedbackEmail({ input: { category: "bug", message: "hi" }, user })).toThrow();
  });

  it("targets FEEDBACK_TO_EMAIL, category-prefixed subject, reply-to = submitter", () => {
    const out = composeFeedbackEmail({ input: { category: "bug", message: "hi" }, user });
    expect(out.to).toBe("support@ptfolio.net");
    expect(out.subject).toBe("[Bug] Feedback from Jane");
    expect(out.replyTo).toBe("jane@example.com");
  });

  it("falls back to email in the subject when name is absent", () => {
    const out = composeFeedbackEmail({
      input: { category: "idea", message: "hi" },
      user: { id: "u2", email: "no-name@example.com" },
    });
    expect(out.subject).toBe("[Idea] Feedback from no-name@example.com");
  });

  it("uses the submitted subject after the category prefix when one is given", () => {
    const out = composeFeedbackEmail({
      input: { category: "idea", subject: "Dark mode for exports", message: "hi" },
      user,
    });
    expect(out.subject).toBe("[Idea] Dark mode for exports");
  });

  it("replies to the nominated contact email and records it in the body", () => {
    const out = composeFeedbackEmail({
      input: { category: "bug", message: "hi", contactEmail: "other@example.com" },
      user,
    });
    expect(out.replyTo).toBe("other@example.com");
    expect(out.html).toContain("other@example.com");
    // The account address is still shown, so the sender stays unambiguous.
    expect(out.html).toContain("jane@example.com");
  });

  it("HTML-escapes the message so injected markup cannot break out", () => {
    const out = composeFeedbackEmail({
      input: { category: "other", message: "<script>alert(1)</script>" },
      user,
    });
    expect(out.html).not.toContain("<script>");
    expect(out.html).toContain("&lt;script&gt;");
  });
});

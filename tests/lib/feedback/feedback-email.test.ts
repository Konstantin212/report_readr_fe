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

  it("HTML-escapes the message so injected markup cannot break out", () => {
    const out = composeFeedbackEmail({
      input: { category: "other", message: "<script>alert(1)</script>" },
      user,
    });
    expect(out.html).not.toContain("<script>");
    expect(out.html).toContain("&lt;script&gt;");
  });
});

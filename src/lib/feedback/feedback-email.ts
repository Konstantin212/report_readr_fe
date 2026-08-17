import { z } from "zod";

import type { AppSessionUser } from "@/lib/auth/server";
import type { SendEmailInput } from "@/lib/email/resend";
import { FEEDBACK_CATEGORIES, FEEDBACK_CATEGORY_LABELS } from "./categories";

export const feedbackSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES),
  message: z.string().trim().min(1).max(5000),
});

export type FeedbackInput = z.infer<typeof feedbackSchema>;

/** Escapes the five HTML-significant characters. The message and name are
 *  user-controlled and interpolated into an HTML email body. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function composeFeedbackEmail({
  input,
  user,
}: {
  input: FeedbackInput;
  user: AppSessionUser;
}): SendEmailInput {
  const to = process.env.FEEDBACK_TO_EMAIL;
  if (!to) {
    throw new Error("FEEDBACK_TO_EMAIL is not set.");
  }

  const label = FEEDBACK_CATEGORY_LABELS[input.category];
  const who = user.name ?? user.email;
  const subject = `[${label}] Feedback from ${who}`;

  const safeName = escapeHtml(user.name ?? "");
  const safeEmail = escapeHtml(user.email);
  const safeMessage = escapeHtml(input.message).replace(/\n/g, "<br>");

  const html = `
    <div style="font-family: sans-serif; line-height: 1.5;">
      <p><strong>Category:</strong> ${label}</p>
      <p><strong>From:</strong> ${safeName} &lt;${safeEmail}&gt;</p>
      <hr />
      <p>${safeMessage}</p>
    </div>
  `.trim();

  return { to, subject, html, replyTo: user.email };
}

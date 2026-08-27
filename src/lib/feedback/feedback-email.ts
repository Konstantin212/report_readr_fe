import { z } from "zod";

import type { AppSessionUser } from "@/lib/auth/server";
import type { SendEmailInput } from "@/lib/email/resend";
import { FEEDBACK_CATEGORIES, FEEDBACK_CATEGORY_LABELS } from "./categories";

/** Blank optional fields arrive as "" from the form; treat them as absent. */
const blankToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

export const feedbackSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES),
  subject: z.preprocess(
    blankToUndefined,
    z
      .string()
      .trim()
      .max(150)
      // The subject lands in an email header, where a bare CR/LF would let a
      // submitter append headers of their own — collapse them to spaces.
      .transform((s) => s.replace(/[\r\n]+/g, " "))
      .optional(),
  ),
  contactEmail: z.preprocess(
    blankToUndefined,
    z.string().trim().email().max(254).optional(),
  ),
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
  const subject = input.subject
    ? `[${label}] ${input.subject}`
    : `[${label}] Feedback from ${who}`;

  // The submitter may nominate a different address to be reached on; the
  // account email is still reported in the body so the sender is never
  // ambiguous.
  const replyTo = input.contactEmail ?? user.email;

  const safeName = escapeHtml(user.name ?? "");
  const safeEmail = escapeHtml(user.email);
  const safeMessage = escapeHtml(input.message).replace(/\n/g, "<br>");
  const contactRow =
    input.contactEmail && input.contactEmail !== user.email
      ? `<p><strong>Reply to:</strong> ${escapeHtml(input.contactEmail)}</p>`
      : "";

  const html = `
    <div style="font-family: sans-serif; line-height: 1.5;">
      <p><strong>Category:</strong> ${label}</p>
      <p><strong>From:</strong> ${safeName} &lt;${safeEmail}&gt;</p>
      ${contactRow}
      <hr />
      <p>${safeMessage}</p>
    </div>
  `.trim();

  return { to, subject, html, replyTo };
}

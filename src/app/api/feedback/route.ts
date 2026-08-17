import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import { sendEmail } from "@/lib/email/resend";
import { composeFeedbackEmail, feedbackSchema } from "@/lib/feedback/feedback-email";
import { allowFeedback } from "@/lib/feedback/rate-limit";

export const runtime = "nodejs";

/**
 * Signed-in users submit feedback; each submission is emailed to
 * FEEDBACK_TO_EMAIL with reply-to set to the submitter. Email is the only
 * sink — nothing is persisted (design spec 2026-08-08-feedback-form §0).
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!allowFeedback(user.id)) {
    return NextResponse.json(
      { error: "Too many messages — please wait a moment." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please choose a type and enter a message." },
      { status: 400 },
    );
  }

  try {
    await sendEmail(composeFeedbackEmail({ input: parsed.data, user }));
  } catch {
    return NextResponse.json(
      { error: "Could not send your message. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

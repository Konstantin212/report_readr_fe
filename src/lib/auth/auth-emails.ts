import { sendEmail } from "@/lib/email/resend";

/**
 * Transactional-email bodies for better-auth's `emailVerification` and
 * `emailAndPassword.sendResetPassword` config hooks. Extracted into plain,
 * standalone functions (rather than inline in `setup.ts`'s `betterAuth({...})`
 * call) specifically so they're unit-testable without constructing the full
 * `betterAuth()` instance.
 *
 * Kept deliberately template-free — plain HTML strings are fine at this
 * app's size (see `@/lib/email/resend`).
 */

interface EmailTarget {
  email: string;
  name?: string | null;
}

export async function sendVerificationEmail({
  user,
  url,
}: {
  user: EmailTarget;
  url: string;
}): Promise<void> {
  await sendEmail({
    to: user.email,
    subject: "Verify your email for Folio",
    html: verificationEmailHtml(url),
  });
}

export async function sendResetPasswordEmail({
  user,
  url,
}: {
  user: EmailTarget;
  url: string;
}): Promise<void> {
  await sendEmail({
    to: user.email,
    subject: "Reset your Folio password",
    html: resetPasswordEmailHtml(url),
  });
}

function verificationEmailHtml(url: string): string {
  return `
    <div style="font-family: sans-serif; line-height: 1.5;">
      <p>Welcome to Folio.</p>
      <p>Click the link below to verify your email address:</p>
      <p><a href="${url}">${url}</a></p>
      <p>If you didn't create a Folio account, you can safely ignore this email.</p>
    </div>
  `.trim();
}

function resetPasswordEmailHtml(url: string): string {
  return `
    <div style="font-family: sans-serif; line-height: 1.5;">
      <p>We received a request to reset your Folio password.</p>
      <p>Click the link below to choose a new password:</p>
      <p><a href="${url}">${url}</a></p>
      <p>If you didn't request a password reset, you can safely ignore this email — your password will not change.</p>
    </div>
  `.trim();
}

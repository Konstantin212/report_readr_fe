import { Resend } from "resend";

/**
 * Thin wrapper around the Resend SDK. Kept intentionally minimal — no
 * template engine, no retry/queueing — this app's outbound mail volume
 * (auth transactional email only) doesn't warrant more.
 *
 * Reads `process.env.RESEND_API_KEY` / `process.env.RESEND_FROM_EMAIL`
 * directly rather than importing the Zod-parsed `@/lib/env`, matching the
 * existing convention in `src/lib/auth/*.ts` (see `setup.ts`, `allowlist.ts`,
 * `admin.ts`).
 */

let client: Resend | null = null;

export function getResendClient(): Resend {
  if (!client) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not set.");
    }
    client = new Resend(apiKey);
  }
  return client;
}

// Test-only. Reset the cached client after mutating process.env in a test.
export function _resetResendClientForTests(): void {
  client = null;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

/**
 * Sends a plain HTML email via Resend. Throws on any failure — API-level
 * errors (bad from-address, quota, etc.) surfaced by the SDK as a
 * `{ error }` result rather than a rejection, and unexpected SDK
 * rejections (network, etc.) — rather than swallowing either. Callers
 * (better-auth's `sendVerificationEmail`/`sendResetPassword` hooks) need
 * to know if a transactional email failed to send.
 */
export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<void> {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) {
    throw new Error("RESEND_FROM_EMAIL is not set.");
  }

  const resend = getResendClient();
  const { error } = await resend.emails.send({ from, to, subject, html });

  if (error) {
    throw new Error(`Failed to send email via Resend: ${error.message}`);
  }
}

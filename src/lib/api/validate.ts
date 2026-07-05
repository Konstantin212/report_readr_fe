import { NextResponse } from "next/server";
import type { z } from "zod";

/**
 * Server half of the shared API contract (see lib/api/contracts.ts).
 *
 * Validates the response payload against the endpoint's schema BEFORE it
 * goes over the wire. A mismatch is a bug in our own loader-vs-contract
 * pairing (or a serialization surprise), so it must be loud in the Vercel
 * function logs — but it must never take the endpoint down: the data is
 * still returned as-is and the FE's own safeParse will warn again.
 */
export function validatedJson<T>(schema: z.ZodType<T>, data: T, endpoint: string): NextResponse {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    console.warn(
      `[api-contract] ${endpoint} response does not match its schema (${result.error.issues.length} issue${result.error.issues.length === 1 ? "" : "s"}): ${issues}`,
    );
  }
  // Always return the ORIGINAL data — validation is advisory. Returning
  // result.data would silently strip keys the schema doesn't know about.
  return NextResponse.json(data);
}

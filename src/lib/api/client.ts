import type { z } from "zod";

/**
 * Client half of the shared API contract (see lib/api/contracts.ts).
 *
 * Fetches JSON and validates it against the SAME schema the route validated
 * against before sending. A mismatch here means the deployed BE and the
 * loaded FE bundle disagree about the shape (deploy skew, serialization
 * drift) — warn in the console with the offending paths, but hand the data
 * through so the UI degrades gracefully instead of white-screening.
 */
export async function fetchApi<T>(url: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}`);
  const json: unknown = await res.json();

  const result = schema.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    console.warn(
      `[api-contract] ${url} response does not match the shared schema (${result.error.issues.length} issue${result.error.issues.length === 1 ? "" : "s"}): ${issues}`,
    );
    // Advisory: return the raw payload rather than throwing — most drift is
    // an added/renamed field, and rendering partial data beats an error page.
    return json as T;
  }
  return result.data;
}

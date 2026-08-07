import { describe, expect, it } from "vitest";

import { abandonedCandidatePredicate } from "@/lib/auth/auth-cleanup";
import { getDb } from "@/lib/db/client";
import { user } from "@/lib/db/schema";

/**
 * Structural regression test for the abandoned-account safeguard
 * predicate (design doc §23.2/§23.3). Deliberately does NOT hit a real
 * database — `db.select().from().where().toSQL()` only builds the SQL
 * text; nothing executes until the query is awaited. This guards against
 * the "living list" (see the doc-comment above `user` in schema.ts)
 * silently losing a table on a future refactor — every owner-scoped
 * table must appear in the generated WHERE clause.
 */
describe("abandonedCandidatePredicate (structural — no DB required)", () => {
  it("references every owner-scoped table from the living list, plus the age/verification guards", () => {
    const db = getDb();
    const query = db
      .select({ id: user.id })
      .from(user)
      .where(abandonedCandidatePredicate(db));
    const { sql: text, params } = query.toSQL();

    // Age + verification guards. email_verified is parameterized ($1 = false).
    expect(text).toContain('"user"."email_verified" = $1');
    expect(params[0]).toBe(false);
    expect(text).toContain("interval '6 months'");

    // Every owner-scoped table in the living list (design doc §23.2) must
    // have a NOT EXISTS clause referencing it by name.
    const expectedTables = [
      "broker_accounts",
      "imports",
      "instruments",
      "transactions",
      "positions",
      "tax_reports",
      "tax_report_lines",
      "lots",
      "realized_matches",
      "user_settings",
      "crypto_accounts",
      "crypto_wallets",
      "crypto_daily_values",
    ];
    for (const table of expectedTables) {
      expect(text, `expected a NOT EXISTS clause referencing "${table}"`).toMatch(
        new RegExp(`not exists[\\s\\S]*?"${table}"|"${table}"[\\s\\S]*?not exists`, "i"),
      );
    }

    // Exactly 13 NOT EXISTS clauses — one per table, no more, no fewer.
    const notExistsCount = (text.match(/not exists/gi) ?? []).length;
    expect(notExistsCount).toBe(expectedTables.length);
  });
});

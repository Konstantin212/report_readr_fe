/**
 * One-off bootstrap for the admin panel (admin-panel design doc §3.5).
 *
 * Reads the existing ADMIN_EMAILS env var (src/lib/auth/admin.ts — the
 * same var that already gates the legacy /api/admin/allowlist and
 * /api/admin/refresh-quotes routes, see admin-panel-ac.md's open finding
 * #1) and sets role = 'admin' on every existing user row whose email
 * matches. Deliberately a manual, explicitly-run step, NOT baked into
 * the schema migration itself — migrations shouldn't depend on runtime
 * env vars, and until this script runs, `role` is NULL for every row
 * (zero admins), which is safe: the admin panel UI/routes aren't
 * reachable by anyone in that window anyway (no admin exists yet to
 * reach them). See design doc §3.5 step 4.
 *
 * Run once, after the schema migration lands and before anyone needs to
 * use the admin panel:
 *
 *   export DATABASE_URL=…; export ADMIN_EMAILS=you@example.com,other@example.com
 *   npx tsx scripts/bootstrap-admin-roles.ts
 *
 * Safe to re-run: rows already role='admin' are simply set again
 * (no-op), and emails with no matching user are reported, not errored.
 */
import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { user } from "@/lib/db/schema";
import { getAdminEmails } from "@/lib/auth/admin";

async function main() {
  const emails = getAdminEmails();
  if (emails.length === 0) {
    console.error("ADMIN_EMAILS is unset or empty — nothing to do. Aborting.");
    process.exit(1);
  }

  const db = getDb();

  const matched = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(inArray(user.email, emails));

  if (matched.length === 0) {
    console.log(`No existing user rows match ADMIN_EMAILS (${emails.join(", ")}). Nothing to promote.`);
    process.exit(0);
  }

  await db
    .update(user)
    .set({ role: "admin" })
    .where(
      inArray(
        user.id,
        matched.map((u) => u.id),
      ),
    );

  console.log(`Promoted ${matched.length} user(s) to role = 'admin':`);
  for (const u of matched) console.log(`  - ${u.email} (${u.id})`);

  const unmatched = emails.filter((e) => !matched.some((u) => u.email.toLowerCase() === e));
  if (unmatched.length > 0) {
    console.log(`\nADMIN_EMAILS entries with no matching existing user (will not have an account yet):`);
    for (const e of unmatched) console.log(`  - ${e}`);
  }

  console.log("\ndone");
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

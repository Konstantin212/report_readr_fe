# Admin Panel — Design Spec

**Date:** 2026-08-08
**Status:** Draft — ready for `developer`
**Author:** architect
**Reads:** `docs/superpowers/specs/2026-08-08-admin-panel-ac.md` (AC doc, all 6 AC
groups), `docs/INDEX.md`, `src/lib/db/schema.ts`, `src/lib/auth/setup.ts`,
`src/lib/auth/admin.ts`, `src/lib/auth/server.ts`, `src/lib/auth/auth-cleanup.ts`,
`node_modules/better-auth@1.6.11` (`plugins/admin`) source.

---

## 0. Central decisions, up front

1. **Adopt `better-auth/plugins/admin` — narrowly.** Use it for the `role`
   column concept and, specifically, for the **impersonation session-swap
   mechanism** (cookie stash/restore — genuinely risky to hand-roll safely).
   Do **not** route list/edit/delete through the plugin's own generic REST
   endpoints; those are implemented as hand-rolled Drizzle queries under our
   own guard, for reasons in §2.
2. **No `src/middleware.ts`.** This repo pins `next@^15.1.0`, below the
   `>=15.2.3` floor CLAUDE.md requires before middleware can safely be a
   security boundary (CVE-2025-29927, `x-middleware-subrequest` bypass).
   Route protection stays **inline-guard-per-route**, same pattern as every
   other guarded route in this codebase today. See §3.
3. **New `admin_audit_log` table**, append-only, with **no cascading FK** to
   `user.id` on the *target* side — a hard requirement, not a style choice
   (§4.3), because the log for AC-4.5 must outlive the very account deletion
   it records.
4. **`isAdminEmail()`/`ADMIN_EMAILS` is untouched.** It keeps gating the
   existing `/api/admin/allowlist*`, `/api/admin/refresh-quotes`,
   `/api/admin/backfill-fx`, `/api/admin/backfill-history` routes and the
   Settings → Members section, per AC §2 (explicitly out of scope). The new
   admin panel is gated by the new `user.role` column exclusively, via its
   own guard functions (§5). These are two independent, non-interacting
   admin concepts sitting side by side until/unless a future feature
   decides to converge them — not attempted here.
5. **Three product-level questions are flagged, not decided** — see §12.
   Do not start implementation until the conductor has confirmed them with
   the user, per the task brief.

---

## 1. Why the plugin, and why *not* all of it

`better-auth@1.6.11` is installed (package.json pins `^1.2.0`, which is
satisfied). `plugins/admin` ships:

- Schema additions: `user.role`, `user.banned`, `user.banReason`,
  `user.banExpires`, `session.impersonatedBy`.
- Endpoints: `setRole`, `banUser`/`unbanUser`, `impersonateUser`/
  `stopImpersonating`, `removeUser`, `adminUpdateUser`, `listUsers`,
  `revokeUserSession(s)`, `setUserPassword`, `getUser`, `createUser`.
- A `hasPermission(...)` check gate on every one of those endpoints, driven
  by `adminRoles` config.
- The impersonation mechanism (`routes.mjs` `impersonateUser`): creates a
  new session for the target user with `impersonatedBy: <adminId>` and
  `expiresAt` bounded by `impersonationSessionDuration` (default 3600s),
  **stashes the admin's own session token in a separate signed
  `admin_session` cookie**, then swaps the active session cookie to the
  target's. `stopImpersonating` reverses this. This is exactly the kind of
  security-sensitive, easy-to-get-wrong code (session forgery, cookie
  handling) the `software-architecture` skill's "external dependencies"
  principle argues for not hand-rolling. **This is the one piece of the
  plugin this design leans on directly.**

What the design does **not** use the plugin for, and why:

- **`setRole`, `removeUser`, `adminUpdateUser`, `listUsers`.** These are
  generic and know nothing about this app's specific invariants: AC-1.4/
  AC-6.3's "last admin must always exist" guard, AC-4.2/AC-5.7's
  self-action blocks, the AC-4.5/5.6/6.4 audit-log shape, or AC-6.2's
  email-verification-gate interaction. Using them would mean wrapping every
  one of them in app-specific pre/post logic anyway — at that point a plain
  Drizzle query under our own route, matching the existing `src/lib/data/*`
  + `src/app/api/admin/*` convention (see `allowlist/route.ts`), is more
  legible than fighting the plugin's generic shape. It also keeps the
  last-admin guard **atomic at the SQL level** (§8.3), which matters given
  the driver constraint below.
- **`banUser`/`unbanUser`.** Not requested (AC-6.1 explicitly leaves
  ban/suspend as an open question, §12.3). The `banned`/`banReason`/
  `banExpires` columns still have to exist in the schema regardless (the
  plugin's session middleware unconditionally reads
  `user.banExpires`/`user.banned` on every session lookup once the plugin
  is registered — leaving them out breaks the adapter), but no ban/unban UI
  ships in this feature.

**Driver constraint that shapes §8/§9/§10:** `src/lib/db/client.ts` uses
`drizzle-orm/neon-http`, which has **no transaction support** —
`auth-cleanup.ts`'s own doc-comment already discovered and worked around
this (`db.transaction()` throws "No transactions support in neon-http
driver"). The existing precedent is single atomic `UPDATE/DELETE ... WHERE
<predicate> RETURNING ...` statements instead of multi-statement
transactions. This design follows the same precedent throughout — see
§8.3, §9.5, §10.3 for where it matters.

---

## 2. Why not middleware

AC-2.5 wants "every admin-panel route independently performs the
server-side role check... verifiable by a shared test helper, single
enforced choke point." Middleware would be a natural way to get a single
choke point for free — but CLAUDE.md is explicit: this repo's Next.js
security floor for using middleware as a trust boundary is `>=15.2.3`
(CVE-2025-29927 lets a crafted `x-middleware-subrequest` header bypass
middleware entirely), and the repo currently pins `^15.1.0`. Leaning on
middleware here would silently reintroduce exactly the bypass class
CLAUDE.md flags.

Instead, the "single choke point" is two small functions (§5) that every
admin page/route calls as its first line, mirroring the existing
`requireCurrentUser()` pattern in `src/lib/auth/server.ts`. This is
verifiable the same way AC-2.5 asks — a test (owned by `tester`) that greps
every file under `src/app/(app)/admin/**/page.tsx` and
`src/app/api/admin/panel/**/route.ts` for a call to `requireAdminUser`/
`requireAdminApi`, so a future route that forgets the call fails CI rather
than silently shipping unguarded — without touching the CVE class at all.
If/when `next` is bumped past `15.2.3`, middleware could be *added* later
as a UX-layer early-redirect (e.g. skip rendering a page shell before the
inline guard even runs), but it must never become the sole enforcement —
call this out again if that bump happens.

---

## 3. Data model changes

### 3.1 `user` table additions (`src/lib/db/schema.ts`)

```ts
role: text("role"),               // nullable; "admin" | "user" | null. NULL == non-admin (AC-1.3 default-deny)
banned: boolean("banned").notNull().default(false),   // required by admin plugin's session middleware; no UI in v1
banReason: text("ban_reason"),
banExpires: timestamp("ban_expires"),
```

`role` is deliberately **not** `notNull().default("user")` at the DB level:
after migration, every pre-existing row gets `NULL`, and `NULL` must read as
non-admin with zero extra code — the admin-check (§5) treats anything other
than the literal string `"admin"` as non-admin, so `NULL`, `"user"`, or an
unrecognized future value are all equally safe. New sign-ups get `role:
"user"` written explicitly in the existing `databaseHooks.user.create.before`
hook in `src/lib/auth/setup.ts` (see §3.3 — do not rely on the plugin's own
default-role hook for this).

### 3.2 `session` table addition

```ts
impersonatedBy: text("impersonated_by"),  // set by better-auth's own impersonateUser endpoint; null in normal sessions
```

### 3.3 Integration note for `setup.ts` — do this explicitly, don't assume hook merge order

`setup.ts` already has a `databaseHooks.user.create.before` hook (the
sign-up-allowlist check). The admin plugin's own `init()` *also* contributes
a `databaseHooks.user.create.before` that sets `role: options.defaultRole ??
"user"`. Whether better-auth threads the plugin's contributed hook output
into the app-supplied hook's input (so the existing hook's `return { data:
user }` would pass the plugin-set role through unchanged) or the
app-supplied hook simply wins outright is implementation-detail behavior
that shouldn't be trusted blind for an AC-1.3 (default-deny) guarantee.
**Change the existing hook explicitly:**

```ts
before: async (user) => {
  if (getSignupMode() === "restricted" && !(await isEmailAllowedToSignIn(user.email))) {
    throw new Error("Email is not authorized for this private app.");
  }
  return { data: { ...user, role: user.role ?? "user" } };
},
```

and add `admin({ defaultRole: "user", adminRoles: ["admin"],
allowImpersonatingAdmins: false, impersonationSessionDuration: 1800 })` to
`plugins: [...]` alongside the existing `signupAttemptExchange()`. Cover this
with a unit test asserting a freshly-created user always has `role ===
"user"`, never `null`/`undefined`, regardless of hook ordering — this is the
kind of thing that should fail loudly in CI if better-auth's internal
merge behavior ever changes across an upgrade.

`allowImpersonatingAdmins: false` (the library default) is deliberate: it
means the plugin itself already refuses to let one admin impersonate
another, closing most of AC-5.5's "no nested-impersonation-as-a-privilege-
escalation-vector" concern at the library level, on top of the app-level
guard in §5.

### 3.4 New `admin_audit_log` table

```ts
export const adminActionEnum = pgEnum("admin_action", [
  "ACCOUNT_DELETE",
  "ACCOUNT_EDIT",
  "IMPERSONATION_START",
  "IMPERSONATION_END",
]);

export const adminAuditLog = pgTable("admin_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  action: adminActionEnum("action").notNull(),
  adminUserId: text("admin_user_id").references(() => user.id, { onDelete: "set null" }),
  adminEmailSnapshot: text("admin_email_snapshot").notNull(),
  // Deliberately NOT a FK to user.id — see §0.3 / §8.3. Must survive the
  // very account deletion (or account whose email changed) it documents.
  targetUserId: text("target_user_id").notNull(),
  targetEmailSnapshot: text("target_email_snapshot").notNull(),
  // Action-specific payload, e.g. { before: {name,email,role}, after: {...} }
  // for ACCOUNT_EDIT; { plannedExpiresAt } for IMPERSONATION_START;
  // { endReason: "EXITED" | "AUTO_EXPIRED" } for IMPERSONATION_END.
  detail: jsonb("detail"),
  // Links an IMPERSONATION_END row back to its IMPERSONATION_START row.
  relatedActionId: uuid("related_action_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

Design notes:

- **Append-only, immutable.** No update/delete path is ever exposed. This
  matches the app's existing event-sourced-ledger philosophy (transactions/
  lots/realizedMatches are never mutated in place either) — an audit log
  that can be edited after the fact isn't an audit log.
- **`targetUserId` has no FK constraint at all** (not even `set null`) —
  a `set null` FK would still lose *which* user it was; the mandatory
  `targetEmailSnapshot` (captured at write-time, before deletion) is what
  actually answers "whom" durably per AC-4.5/5.6/6.4, and not having a
  constraint means the delete statement in §8.3 never has to worry about
  ordering relative to the audit write.
- **Not added to `auth-cleanup.ts`'s `abandonedCandidatePredicate()`.**
  That predicate's doc-comment requires enumerating tables with a
  cascading, owner-scoped FK to `user.id`. `admin_audit_log` has neither
  (its "ownership" is the admin action itself, not the target user's own
  data, and there's no cascade) — same reasoning that already excludes
  `allowedEmails.addedByUserId` (`set null`) and `session`/`account`/
  `verification` (auth mechanism, not user-owned data) from that list. A
  past admin action mentioning a user must never block that user's own
  abandoned-account sweep eligibility, and it can't be swept itself either
  way since nothing references it. No change needed to `auth-cleanup.ts`.
- **`adminUserId` is a real (nullable) FK** with `onDelete: "set null"` —
  matching the existing `allowedEmails.addedByUserId` precedent exactly —
  because it's plausible an admin's own account gets deleted later by
  another admin; the log entry should survive with its `adminEmailSnapshot`
  intact rather than disappear.
- **Data minimization (`gdpr-compliance` skill):** the log stores only
  email + role/name diffs needed to answer "who did what to whom, when" —
  no IP address, no session token, no free-text notes field. `detail` is a
  small structured diff, not a dump of the full user row.

### 3.5 Rollout / bootstrap sequence

1. Ship the schema migration (`role`/`banned`/`banReason`/`banExpires` on
   `user`, `impersonatedBy` on `session`, new `admin_audit_log` table +
   enum) via the existing `drizzle-kit generate`/`db:push` flow.
2. Register the `admin()` plugin in `setup.ts` (§3.3).
3. Run a **one-off bootstrap script**, `scripts/bootstrap-admin-roles.ts`
   (matching the existing `scripts/backfill-*.ts` convention), which reads
   `ADMIN_EMAILS` and sets `role = 'admin'` for every existing user whose
   email matches — a manual, explicitly-run step, not baked into the
   migration itself (migrations shouldn't depend on runtime env vars).
4. Only after step 3 does AC-1.4 ("at least one admin must always exist")
   become a meaningful invariant to enforce going forward — between steps 1
   and 3 every user has `role = NULL` (zero admins), which is fine because
   the admin panel UI/routes aren't reachable by anyone in that window
   anyway (there's no admin yet to reach them). Document this window in the
   PR description; don't try to make it atomic with the migration.

---

## 4. Enforcement choke points

`src/lib/auth/require-admin.ts` (new file, sibling to `server.ts`):

```ts
export type AdminSessionUser = { id: string; email: string; name?: string; role: "admin" };

async function getAdminSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.email) return null;                    // signed out
  if (session.user.emailVerified === false) return null;      // existing gate, unchanged
  if (session.session.impersonatedBy) return null;             // AC-5.5 floor — see §9.4
  if (session.user.role !== "admin") return null;              // AC-1.3 default-deny
  return session;
}

export async function requireAdminUser(): Promise<AdminSessionUser> {
  const session = await getAdminSession();
  if (!session) redirect("/");     // AC-2.1: away, no panel content ever rendered
  return { id: session.user.id, email: session.user.email, name: session.user.name ?? undefined, role: "admin" };
}

export async function requireAdminApi(): Promise<AdminSessionUser | NextResponse> {
  const currentUser = await getCurrentUser();     // existing helper, unchanged
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 }); // AC-2.3
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });        // AC-2.2
  return { id: session.user.id, email: session.user.email, name: session.user.name ?? undefined, role: "admin" };
}
```

This mirrors the existing `requireAdmin()` pattern in
`src/app/api/admin/allowlist/route.ts` (401-then-403), just keyed off
`role` instead of `isAdminEmail()`, plus the new impersonation-floor check.

**The `impersonatedBy` check is what makes AC-5.5 structural, not just
policed per-route:** an impersonated session's `session.user.role` is the
*target's* role (that's how the plugin's cookie swap works — see §1). Even
if the target happens to be an admin (already blocked from being
impersonated in the first place by `allowImpersonatingAdmins: false`, §3.3),
`getAdminSession()` explicitly refuses any session carrying
`impersonatedBy`, full stop. That means **no impersonated session can ever
reach `requireAdminUser`/`requireAdminApi`, ever** — not "change target's
role" specifically, all of it. This is stricter than AC-5.5's literal list
(password/email/role/delete/nested-impersonate) but simpler to reason about
and get right, and doesn't conflict with the AC.

`requireAdminUser()` is called first line in every admin page/layout;
`requireAdminApi()` first line in every admin API route. §2's shared test
helper asserts this via source-grep across both directories.

---

## 5. Route structure

Pages (reuse the existing `(app)` shell/layout, matching how Settings
already does admin-gated sections inline rather than a whole separate
chrome — AC-2.4's "hide the nav entry" is a small conditional in the
existing nav component, not a new shell):

```
src/app/(app)/admin/layout.tsx          → calls requireAdminUser() once; wraps children
src/app/(app)/admin/page.tsx            → AC-3 user list (server component, direct Drizzle read)
src/app/(app)/admin/users/[id]/page.tsx → AC-3.5 detail view; entry point for edit/delete/impersonate actions
```

`layout.tsx` doing the single `requireAdminUser()` call for the whole
`/admin/*` subtree is *not* a substitute for §2's per-route-file
verification requirement — Next.js layouts wrap same-segment pages but
**not** API routes, and AC-2.5 explicitly requires "backing API endpoints"
covered too. So: layout guard for pages (belt), `requireAdminApi()` in every
mutating route below (suspenders + the actual enforced boundary for
non-page requests, e.g. curl straight at an API route per AC-2.2, which
never goes through the page layout at all).

API routes (client components — matching the existing
`ResetBrokerButton`/`BackfillFxButton` fetch-to-`/api/admin/*` pattern, not
server actions, since this app has no server-action usage anywhere today):

```
src/app/api/admin/panel/users/[id]/route.ts             → PATCH (AC-6 edit), DELETE (AC-4 delete)
src/app/api/admin/panel/users/[id]/impersonate/route.ts → POST (AC-5.1 start)
src/app/api/admin/panel/impersonate/stop/route.ts        → POST (AC-5.4 exit / also used by auto-expiry banner)
```

No `GET /api/admin/panel/users` route: the list (§6) and detail views are
plain server components reading Drizzle directly (matching
`settings/page.tsx`'s existing pattern for `allowedEmails`), since nothing
client-side needs to re-fetch that data outside of a full page navigation.

---

## 6. AC-3: user list

Server component query (`src/lib/data/admin-users.ts`, new file, matching
the `src/lib/data/*.ts` convention):

```sql
SELECT u.id, u.email, u.name, u.created_at, u.role,
       EXISTS (SELECT 1 FROM imports i WHERE i.owner_user_id = u.id) AS has_uploaded
FROM "user" u
ORDER BY u.created_at DESC
LIMIT :pageSize OFFSET :offset
```

- **AC-3.1 "all users" = "not deleted"** — confirmed: this app has no
  soft-delete concept anywhere (deletion in §8 is a hard `DELETE`), so
  `SELECT * FROM user` with no filter already is "all currently-existing
  accounts." No recency/last-seen filter — the AC doc's framing carries
  through unchanged (open question #3 in the AC doc, resolved as stated).
- **AC-3.3 uploaded-signal** — `EXISTS (... imports ...)`, scoped strictly
  to `imports` rows per the AC doc's literal wording (§0 there). Coinbase
  (`cryptoAccounts`) connections do **not** count — see §12.2 for the
  flagged ambiguity carried forward from the AC doc.
- **AC-3.4 scale** — offset pagination, page size ~50, default sort
  `createdAt DESC`. This app's own docs describe it as effectively a
  "5-user app" today; offset pagination is more than sufficient for "legible
  at hundreds," and keyset/cursor pagination would be premature
  optimization (YAGNI) — flag as a future upgrade only if the AC's "hundreds"
  bar is ever actually approached.
- **AC-3.5** — each row links to `/admin/users/[id]`.

---

## 7. AC-4: account deletion

### 7.1 Confirmation (client, presentational — `developer`'s job, not
re-derived here): dialog states irreversibility, delete button stays
disabled until the admin types the target's email exactly. This is a
**UI-only safety net** — the server does not re-validate the typed string,
because the same authenticated admin identity is performing the action
either way and re-validating client-typed text server-side adds no real
security value, only friction. Worth stating explicitly since it's a
deliberate choice, not an oversight.

### 7.2 Guards (server, `requireAdminApi()` already passed):

- AC-4.2: reject if `targetId === admin.id`.
- AC-1.4/via delete: reject if target is an admin **and** is the last one
  (same guard as §10.3's edit-role check — see there for the atomic SQL
  form; deletion reuses the identical guarded-predicate approach, deleting
  `user` only `WHERE id = :targetId AND (role != 'admin' OR (SELECT
  count(*) FROM "user" WHERE role = 'admin' AND id != :targetId) > 0)`).

### 7.3 Ordering, given neon-http has no transactions

Per §1's driver constraint, this **cannot** be "begin tx → delete → write
audit row → commit" the way a design with real transactions would do it.
Order chosen, mirroring `auth-cleanup.ts`'s existing atomic-predicate
precedent:

1. **Delete first**, as a single atomic statement with the guard baked into
   `WHERE` and `RETURNING` the deleted row's `{id, email, createdAt}`:
   ```ts
   const [deleted] = await db.delete(user)
     .where(and(eq(user.id, targetId), <last-admin guard above>))
     .returning({ id: user.id, email: user.email });
   ```
   If it returns 0 rows: either the target didn't exist, or the guard
   rejected it (self, or last admin) — return a 4xx with a specific reason,
   **nothing was logged**, because nothing happened (AC-4.6: failure
   surfaced, not swallowed).
   This single statement is also what makes AC-4.4 ("zero rows remain in
   every owner-scoped table") automatic: those 13 tables plus `session`/
   `account` already `ON DELETE CASCADE` on `user.id` at the DB level (per
   the AC doc's §0 grounding, verified against `schema.ts`) — the cascade
   fires as part of this one statement, in Postgres, atomically. No
   application-level fan-out delete across 13 tables is written or needed.
2. **Then** write the `admin_audit_log` row (`ACCOUNT_DELETE`, using the
   `RETURNING`ed email as `targetEmailSnapshot`).
3. If step 2 throws (the one residual gap this driver constraint leaves —
   deletion already committed, log write failed): catch it, `console.error`
   a structured JSON line (matching this repo's existing
   `auth-cleanup.ts`/`console.log(JSON.stringify(...))` convention, which
   Vercel captures as durable log output) so there's *some* trail even if
   the DB row didn't land, and still return success to the admin for the
   deletion itself but flag in the response body that the audit write
   failed, so the caller isn't silently told everything is fully clean.
   This asymmetry (deletion succeeds even if logging fails) is deliberate:
   deletion is the irreversible, "must not get stuck half-done" side AC-4.6
   cares about; re-running a failed log write is not equivalent to
   re-running a failed deletion, so they don't need identical failure
   handling. Flag this explicitly to `tester` as a case to cover (mock a
   failing insert after a successful delete, assert the response signals
   the discrepancy and the console.error fires).

No raw-file purge step exists or is needed (AC doc §0: no raw uploaded
document store anywhere; the `imports` metadata rows are covered by the
cascade in step 1).

---

## 8. AC-5: impersonation

### 8.1 Start (`POST /api/admin/panel/users/[id]/impersonate`)

1. `requireAdminApi()`.
2. Reject if `targetId === admin.id` (AC-5.7).
3. Write `admin_audit_log` row first this time (`IMPERSONATION_START`,
   `detail: { plannedExpiresAt }`) — capture its `id` as `relatedActionId`
   for the eventual `IMPERSONATION_END` row. Order is flipped relative to
   deletion (§7.3) deliberately: impersonation-start is not itself
   destructive/irreversible the way account deletion is, so logging-then-
   acting is safe here and gives a record even if the subsequent call to
   the plugin's endpoint fails.
4. Call `auth.api.impersonateUser({ headers, body: { userId: targetId },
   asResponse: true })` — `asResponse: true` is required so the
   `Set-Cookie` headers the plugin writes (session swap + `admin_session`
   stash, §1) actually reach the browser; forward that `Response`'s headers
   through our route handler's response.
5. Uses `adminRoles`/`allowImpersonatingAdmins: false` from §3.3 — the
   plugin itself refuses to impersonate another admin unless explicitly
   allowed, which we've left off.

### 8.2 Visible banner (AC-5.2) — presentational, `developer`'s job. Data
needed: `session.session.impersonatedBy` (truthy) + the current
`session.user`'s name/email (which, once impersonating, *is* the target's —
that's the point) plus, separately, a lookup of the stashed admin identity
if the banner wants to show "as {admin}" too (optional nicety, not required
by AC-5.2, which only requires showing whose account is being viewed).

### 8.3 Bounded expiry (AC-5.3) — `impersonationSessionDuration: 1800`
(30 minutes) configured in §3.3, tighter than the plugin's 1-hour default,
given this is a financial/tax app (higher sensitivity posture than the
library's generic default warrants). The impersonated session simply stops
being valid at that point — no separate cron/sweep needed, it's the same
`session.expiresAt` mechanism every other session already uses.

**Logging the "ended" side of an auto-expiry, without a hook to catch it:**
better-auth doesn't fire any hook when a session merely expires (it just
stops validating). So `IMPERSONATION_END` can be written two ways:
- **Explicit exit** (§8.4): write it there, `endReason: "EXITED"`, actual
  timestamp.
- **Auto-expiry**: never explicitly written by a background process for
  this feature (no cron is introduced for this — out of proportion to what
  AC-5.6 asks). Instead, the `IMPERSONATION_START` row's `detail.
  plannedExpiresAt` **is** the durable answer to "when did it end" for the
  auto-expiry case — AC-5.6 only requires a "sufficient answer to who/whom/
  when after the fact," not a live dashboard (explicitly out of scope per
  the AC doc §2's "no dedicated log-viewing screen"), and a known planned
  end time satisfies that bar without new infrastructure. State this
  explicitly to `tester`/`documentation-writer` so it isn't mistaken for a
  gap later.

### 8.4 Exit (`POST /api/admin/panel/impersonate/stop`, AC-5.4)

No `requireAdminApi()` here — during impersonation the caller's
`session.user.role` is the *target's*, not `"admin"` (§4), so the normal
admin guard would itself reject this call. Guard instead: reject with 400 if
`session.session.impersonatedBy` is falsy (nothing to exit); otherwise call
`auth.api.stopImpersonating({ headers, asResponse: true })` (reverses the
cookie swap back to the stashed admin session), then write the
`IMPERSONATION_END` row (`relatedActionId` = the matching START row's id,
looked up by `targetUserId + adminUserId` with no `endedAt` yet set;
`endReason: "EXITED"`).

### 8.5 AC-5.5 write-scope floor — see §4: structurally guaranteed for
every route under `/admin/panel/*` and every page under `/admin/*`, since
an impersonated session can never pass `requireAdminUser`/`requireAdminApi`
at all. This is stricter than the AC's literal list but simpler.

**What this design does *not* resolve: whether impersonation is otherwise
read-only or fully interactive for the target's *own* (non-admin-panel,
non-security-sensitive) app surface** — e.g. can the admin, while
impersonating, actually click around Pulse/upload a statement/change a
setting as that user? This is Open Question 1 (§12.1) — flagged, not
decided, per the task brief.

---

## 9. AC-6: edit account

`PATCH /api/admin/panel/users/[id]/route.ts`, body `{ name?, email?, role?
}` — no other fields accepted (`id`, `signupAttemptId`, `createdAt`,
`updatedAt` are never in the allowed body shape at all, not merely ignored,
matching AC-6.1).

### 9.1 `name` — plain `UPDATE`, no special handling.

### 9.2 `email` (AC-6.2) — **admin-set-and-untrusted, not
admin-set-and-trust.** On email change:
1. `UPDATE user SET email = :new, email_verified = false WHERE id = :targetId`.
2. Call `auth.api.sendVerificationEmail({ body: { email: newEmail } })` (a
   core better-auth endpoint, not a plugin one — works off the email
   address directly, no target session needed) so the target gets a real
   verification link for the new address.
3. Call the admin plugin's `revokeUserSessions` for the target (same
   "security-sensitive change → kill other sessions" posture the app
   already applies to `revokeSessionsOnPasswordReset` in `setup.ts`) — an
   admin-changed email shouldn't leave a stale session signed in under the
   old identity assumption.

This means: after an admin edits a user's email, that user cannot sign in
again until they verify the new address — consistent with, not a bypass of,
the existing email-verification-gate design (`getCurrentUser()`'s existing
`emailVerified === false` hard-block already covers this with zero new
code in `server.ts`).

### 9.3 `role` (AC-6.1/6.3) — same atomic last-admin guard as deletion
(§7.2), applied to a demotion specifically (promotions to `"admin"` never
need the guard):

```ts
await db.update(user)
  .set({ role: "user" })
  .where(and(
    eq(user.id, targetId),
    sql`(SELECT count(*) FROM "user" WHERE role = 'admin' AND id != ${targetId}) > 0`,
  ))
  .returning({ id: user.id });
```

0 rows returned → reject with the AC-1.4/6.3 error. This is a single atomic
statement (no `db.transaction()` needed — consistent with §1's driver
constraint), and Postgres evaluates the subquery predicate at the moment of
the `UPDATE`, closing the same TOCTOU-window concern `auth-cleanup.ts`
already solved the same way (the residual race — two concurrent demotions
of two different "last two admins" each independently seeing count=1 and
both passing — is accepted as a non-issue at this app's scale, same
judgment call `auth-cleanup.ts` implicitly makes; flag it if the admin team
ever grows large enough for concurrent admin actions to be routine).

Explicit reject (not silently ignored) if `role` is present in the body but
not `"admin"`/`"user"` — no other role values exist in this feature.

### 9.4 AC-6.5 — already covered structurally: this route requires
`requireAdminApi()`, so a non-admin calling it (including trying to set
their own `role: "admin"`) gets the 403 from §4 before the handler body
ever runs. No extra check needed in the handler itself.

### 9.5 Audit log (AC-6.4) — one `ACCOUNT_EDIT` row per successful `PATCH`,
`detail: { before: {name,email,role}, after: {name,email,role} }` (only the
fields that actually changed), written **after** the update succeeds (same
reasoning as deletion §7.3 — edits aren't destructive enough to need
log-first ordering, but a failed edit shouldn't produce a log entry either).

---

## 10. Traceability (AC → design section)

| AC | Section |
|---|---|
| AC-1.1 role storage | §3.1, §3.5 |
| AC-1.2 server re-derives role | §4 |
| AC-1.3 default-deny | §3.1, §3.3 |
| AC-1.4 last admin always exists | §7.2, §9.3 |
| AC-2.1–2.3 access control | §4 |
| AC-2.4 UI hidden (nav) | developer, out of architecture scope |
| AC-2.5 every route covered | §2, §4, §5 |
| AC-3.1–3.5 user list | §6 |
| AC-4.1 confirmation | §7.1 |
| AC-4.2 no self-delete | §7.2 |
| AC-4.3/4.4 full removal | §7.3 step 1 |
| AC-4.5 deletion logged | §7.3 step 2 |
| AC-4.6 not silently partial | §7.3 step 3 |
| AC-5.1 confirm before impersonate | UI, developer |
| AC-5.2 visible banner | §8.2 |
| AC-5.3 bounded expiry | §8.3 |
| AC-5.4 explicit exit | §8.4 |
| AC-5.5 security-sensitive floor | §4, §8.5 |
| AC-5.6 start/end logged | §8.1, §8.3, §8.4 |
| AC-5.7 no self-impersonation | §8.1 |
| AC-6.1 editable fields | §9 |
| AC-6.2 email/verification interaction | §9.2 |
| AC-6.3 last-admin guard on edit | §9.3 |
| AC-6.4 edits logged | §9.5 |
| AC-6.5 non-admin can't self-edit | §9.4 |

---

## 11. File-by-file plan (for `developer`)

- `src/lib/db/schema.ts` — add `role`/`banned`/`banReason`/`banExpires` to
  `user`; add `impersonatedBy` to `session`; add `adminActionEnum` +
  `adminAuditLog` table.
- `src/lib/auth/setup.ts` — register `admin(...)` plugin; update
  `databaseHooks.user.create.before` per §3.3.
- `src/lib/auth/require-admin.ts` — new: `requireAdminUser()`,
  `requireAdminApi()` (§4).
- `src/lib/data/admin-users.ts` — new: paginated list query (§6),
  single-user detail query.
- `src/lib/data/admin-audit-log.ts` — new: `writeAuditLog(...)` helper
  (thin insert wrapper, one call site per action type) so the four action
  types share one write path.
- `src/app/(app)/admin/layout.tsx`, `.../page.tsx`,
  `.../users/[id]/page.tsx` — pages (§5).
- `src/app/api/admin/panel/users/[id]/route.ts` — PATCH (§9), DELETE (§7).
- `src/app/api/admin/panel/users/[id]/impersonate/route.ts` — POST (§8.1).
- `src/app/api/admin/panel/impersonate/stop/route.ts` — POST (§8.4).
- `scripts/bootstrap-admin-roles.ts` — one-off (§3.5).
- Nav component (wherever the existing Settings nav / topbar lives) — add
  a conditionally-rendered admin-panel link, gated on the same role check,
  for AC-2.4. Locate via the existing `SettingsSidebar`/`Topbar` components.

Suggested build order (TDD, per `nextjs-security`/`react-best-practices`
skills the `developer` agent owns): schema + plugin registration + the two
guard functions first (with the AC-2.5 grep test written early so every
subsequent route is forced to satisfy it) → list/detail (read-only, lowest
risk) → edit → delete → impersonation last (highest complexity, most
security-sensitive, benefits from everything else already being solid).

---

## 12. Open questions flagged back (do not implement against an assumption here)

### 12.1 Impersonation write scope — read-only vs. interactive

AC-5.5 only pins down a *floor* (security-sensitive actions on the target's
own account are blocked — and per §8.5, this design makes that
structurally true for the entire admin-panel surface). It explicitly leaves
open whether impersonation is otherwise **read-only** or **fully
interactive** for the target's ordinary Pulse/tax/settings pages.

**My recommendation, stated but not silently assumed:** ship **interactive**
(AC-5.5's literal floor, nothing broader) for v1. Reasoning: true read-only
enforcement would require auditing and gating *every* mutating endpoint in
the app (imports ingest/reset, settings, crypto connect, review/
transactions, etc. — dozens of routes) for `session.impersonatedBy`, which
is a much larger surface than this feature's stated scope, and middleware
(the natural place to blanket-enforce that) is off the table per §2. If
product wants true read-only, that's a larger follow-on piece of work, not
a tweak to this design.
**This needs explicit product/user confirmation before `developer` starts
on §8**, since it changes what "interactive" actually permits.

### 12.2 Does admin-triggered deletion double as the GDPR Art. 17 erasure
mechanism?

`docs/CHANGELOG.md` (2026-08-05) states erasure is currently contact-based
only. The deletion flow in §7 *mechanically* satisfies Art. 17 (full hard
delete, cascading through every owner-scoped table) if product designates
it as the erasure path — but this design does not make that designation.
If it becomes the official path, two follow-on gaps need product/legal
sign-off, not just this design doc:
- **Closing the loop with the requesting data subject** — this feature has
  no "confirm to the requesting user that erasure completed" step (out of
  scope per the AC doc §2, no self-service status UI); if this is the
  official Art. 17 path, someone (the admin, manually, today) still needs
  to email the user back.
- **Third-party retained data** — Resend's send/delivery logs, Vercel
  Analytics events tied to the deleted user are **not** touched by this
  flow (same gap the AC doc already flags, carried forward unresolved
  here). Not verified whether this matters practically; flagged, not
  investigated further — outside this feature's scope to resolve.

### 12.3 `banned`/`emailVerified` editing

Not built in v1 (AC-6.1 leaves it explicitly out). The `banned`/`banReason`/
`banExpires` columns exist regardless (§1, required by the plugin's own
session middleware) but are unused/unexposed. Flagging as a low-cost
candidate for a follow-on feature if product wants it, per the AC doc's own
framing — no design work needed now beyond "the columns are already there
if this gets picked up later."

---

## 13. GDPR / tax-system notes

- **`gdpr-compliance` applied**: audit-log data minimization (§3.4), the
  Art. 17 tension flagged rather than silently resolved (§12.2), and the
  email-change flow (§9.2) treats admin-typed email input the same as any
  other untrusted input re: verification — no new "trust the admin"
  bypass of the existing verification gate.
- **`tax-system` skill**: this feature makes **no tax-code line-number,
  rate, or loss-bucket claims** and touches no tax computation logic. The
  only contact with tax data is indirect: account deletion cascades through
  `taxReports`/`taxReportLines`/`lots`/`realizedMatches` exactly the same
  way `auth-cleanup.ts`'s existing abandoned-account sweep already does
  (§7.3 step 1 reuses the same pre-existing FK cascade, adds no new logic
  to those tables). `tax-advisor` review is correctly not needed for this
  feature, per the task brief's own framing.

---

## 14. Handoff

- Next: `developer` implements per §11's file list and build order, TDD per
  `nextjs-security`/`nextjs-best-practices`/`react-best-practices`.
- **Before implementation starts:** conductor should get explicit
  confirmation from the user on §12.1 (impersonation write scope) and
  §12.2 (GDPR erasure designation) — both materially change what gets
  built, not just how.
- `code-reviewer` gate should pay particular attention to: the AC-2.5
  choke-point test actually catching a missing guard (not just existing),
  the atomic-predicate SQL in §7.2/§9.3 (last-admin guard), and that
  `admin_audit_log` writes never block/fail the underlying action's success
  response inappropriately (§7.3 step 3's deliberate asymmetry).
- `tester`: golden-fixture verification is **not** required (no tax
  numbers touched), but the AC-2.5 route-coverage test, the last-admin race
  edge case, and the §7.3 step 3 partial-failure case are all worth
  explicit test cases.
- `documentation-writer`, once shipped: update `docs/INDEX.md` (new
  Business Logic entry for role system + admin panel), and fold the
  account-deletion capability into
  `docs/superpowers/specs/2026-08-05-open-signup-data-lifecycle.md` and
  `docs/CHANGELOG.md`'s "no self-service account-deletion UI exists yet"
  line — **only if/once §12.2 has actually been resolved** by product,
  otherwise document it strictly as "admin housekeeping tool," not as a
  GDPR erasure mechanism, to avoid the docs overstating what was decided.

---

## 15. Resolved decisions (product sign-off, 2026-08-08) — supersede §8.5, §12.1, §12.2

**§12.1 / §8.5 resolved: impersonation is full parity, not "interactive with
guardrails."** Product confirmed admin-as-user should be able to do the same
things the target user can do, with no impersonation-specific action blocks.
This **removes AC-5.5's originally-specified floor** (no separate blocking of
password/email/role change, delete, or nested-impersonation attempts as
distinct impersonation-aware checks). Design impact — this *simplifies* §8:

- **Drop §8.5 entirely as written.** No new `session.impersonatedBy` checks
  need to be added to any non-admin-panel route. An impersonated session
  simply *is* the target's session (that's what better-auth's cookie swap
  already gives us) and behaves exactly as if the target had logged in
  themselves — password/email self-service, if/when such flows exist for
  regular users, work unmodified during impersonation.
- **The only actual limits remaining are structural, not policy:**
  1. Admin-panel access itself stays blocked for impersonated sessions —
     unchanged from §4's `getAdminSession()` (`if
     (session.session.impersonatedBy) return null`). This isn't part of the
     removed AC-5.5 floor; it's the same "role check reflects the *session's*
     role" logic that already governs everything else, and it's what makes
     nested impersonation structurally impossible regardless of the target's
     actual role.
  2. Account deletion still isn't reachable via impersonation, only because
     no self-service deletion flow exists for regular users at all (AC §2
     Out of scope) — not because of a new impersonation-specific rule.
  3. AC-5.3 (bounded expiry) and AC-5.2 (visible banner) are unchanged.
- **`allowImpersonatingAdmins: false` (§3.3) is unaffected** by this
  decision and stays as designed — it was never part of AC-5.5's floor, it's
  a separate guard against an admin impersonating another admin at all.

**§12.2 resolved: admin-triggered deletion is the GDPR Art. 17 erasure
mechanism.** §7's deletion flow (already Art. 17-sufficient mechanically —
full hard delete, cascading through every owner-scoped table) is now the
canonical erasure path, not just "admin housekeeping." Design impact:
- No change to §7's implementation — it already satisfies this.
- `documentation-writer`'s handoff note above is no longer conditional:
  update `docs/CHANGELOG.md`'s "erasure is contact-based only" line
  unconditionally once this ships, not only "if/once §12.2 is resolved."
- Follow-on (tracked, not blocking this build): verify whether third-party
  processors (Resend, Vercel Analytics) hold data this feature doesn't
  reach, and consider routing the existing contact-based erasure requests
  through this same admin-panel deletion going forward.

**Net effect on `developer`'s scope:** this removes work (no impersonation
action-gating to build across the app), not adds it.

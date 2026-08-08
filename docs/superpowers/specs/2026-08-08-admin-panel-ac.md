# Admin Panel — Acceptance Criteria

**Date:** 2026-08-08
**Status:** Draft — ready for `architect`
**Author:** business-analyst
**Companion docs (read before designing):**
- `src/lib/auth/admin.ts`, `src/lib/db/schema.ts`, `src/lib/auth/setup.ts` — grounding for this doc's assumptions (see §0).
- `docs/superpowers/specs/2026-08-05-open-signup-data-lifecycle.md` — existing GDPR data-process/erasure inventory; this feature adds the first UI-driven deletion path (see AC-4).
- `docs/superpowers/specs/2026-08-05-open-signup-design.md`, `2026-08-06-email-verification-gate-design.md` — existing auth surface this feature sits next to.

## 0. Grounding — what already exists in this codebase (verified, not assumed)

- **No per-user `role` column exists today.** `user` table (`src/lib/db/schema.ts:61`) has only
  `id, name, email, emailVerified, image, createdAt, updatedAt, signupAttemptId`. There is no
  `role`, `banned`, `banReason`, or `banExpires` field.
- **"Admin" today is an env-var allowlist, not a durable per-user attribute.** `src/lib/auth/admin.ts`'s
  `isAdminEmail()` checks the caller's email against `ADMIN_EMAILS` (comma-separated env var, fail-closed
  if unset). It gates existing routes: `/api/admin/allowlist*`, `/api/admin/refresh-quotes`,
  `/api/admin/backfill-fx`, `/api/admin/backfill-history`, and the Settings → "Members" section
  (`src/app/(app)/settings/page.tsx`). "Members"/allowlist (`allowed_emails` table) is a **different**
  concept from this feature — it's the sign-up-restriction allowlist, not user account management.
  **This env-var mechanism cannot satisfy requirement #6 (admin edits a user's role from the panel)**
  as-is, since promoting/demoting an admin today requires a redeploy with a changed env var, not a DB
  write. This is flagged as an open question for the architect in §Open Questions, not resolved here.
- **`better-auth` (already a dependency, `^1.2.0`) ships an `admin` plugin** (`better-auth/plugins/admin`,
  confirmed present in `node_modules/better-auth/package.json` exports) providing role storage,
  ban/unban, and session impersonation out of the box. No new npm dependency is required to build this
  feature — worth the architect's evaluation as a build-vs-hand-roll option, but the *decision* to adopt
  it (vs. a custom `role` column + custom impersonation) is an architecture call, not an AC.
- **There is no `src/middleware.ts`.** Every existing admin-gated route protects itself individually
  (calls `requireCurrentUser()`/`getCurrentUser()` then `isAdminEmail()` inline). AC-2 below states the
  *behavioral* requirement (every admin route independently enforces the check server-side); how that's
  structured (shared middleware vs. per-route guard) is an architecture decision.
- **"Uploaded something" = a row in the `imports` table** (`src/lib/db/schema.ts:164`), not a stored raw
  file. Each row records `fileName`, `fileHash`, `broker`, `taxYear`, `eventCount`,
  `insertedEventCount`, `duplicateEventCount`, `statementStartDate/EndDate`, `status`, `createdAt`,
  scoped by `ownerUserId`. **No raw uploaded file (PDF/CSV/JSON) is retained anywhere in this codebase**
  — parsing is one-shot and only the parsed metadata + resulting ledger rows persist. This directly
  corrects the requester's phrase "uploaded documents" in AC-4 below (there is no raw document to purge
  beyond the `imports` metadata row itself).
- **Coinbase (`cryptoAccounts`) is a separate ingestion path** (live API sync, not a file upload). It is
  **not** counted as "did they upload something" per the requester's literal wording, but is close
  enough that the architect/product should confirm — flagged in §Open Questions.
- **All user-owned data already cascade-deletes at the DB level.** 13 tables carry an `ownerUserId`
  (or equivalent) FK to `user.id` with `onDelete: "cascade"` — enumerated in
  `src/lib/auth/auth-cleanup.ts`'s `abandonedCandidatePredicate()`: `brokerAccounts`, `imports`,
  `instruments`, `transactions`, `positions`, `taxReports`, `taxReportLines`, `lots`,
  `realizedMatches`, `userSettings`, `cryptoAccounts`, `cryptoWallets`, `cryptoDailyValues`. Better-auth's
  own `session` and `account` tables also cascade on `user.id`. `allowedEmails.addedByUserId` is the one
  **exception**: `onDelete: "set null"` (deleting an admin who added allowlist entries nulls the
  reference rather than deleting the entries). This means "delete the `user` row" already correctly
  cascades essentially all owned data at the schema level — AC-4 is largely about the *product-level
  guarantees and confirmation flow* around triggering that deletion, not new cascade logic.
- **This would be the product's first UI-driven, admin-triggered account deletion.**
  `docs/CHANGELOG.md` (2026-08-05 entry) explicitly notes "No self-service account-deletion UI exists
  yet; erasure is still contact-based only." This feature is adjacent to, but distinct from, a
  self-service GDPR erasure flow — flagged in §Open Questions.

## 1. User story framing

- As an **admin**, I want a panel only I (and other admins) can reach, so that I can see who's using the
  app, help/support users, and remove accounts, without any regular user being able to do the same.
- As a **regular user**, I want my account inaccessible to anyone but me and an admin acting deliberately
  through the admin panel, so my financial/tax data stays private.

## 2. Out of scope (explicitly not covered by this AC — do not let design/build silently grow into these)

- Self-service (user-initiated) account deletion / GDPR erasure request flow — separate from this
  admin-initiated deletion; not requested here.
- Bulk actions (bulk delete/edit/export across multiple users at once).
- An admin invite/self-signup flow for granting admin role to a brand-new account — role editing here
  is scoped to promoting/demoting *existing* users.
- A general-purpose audit-log UI/dashboard. AC-4 and AC-5 below require that destructive/sensitive
  actions are *recorded* (who did what, to whom, when) for accountability, but a dedicated log-viewing
  screen is not requested and is out of scope.
- Rate limiting or anomaly detection on admin actions.
- Changing the existing `ADMIN_EMAILS`-gated routes (`/api/admin/allowlist*`, `/api/admin/refresh-quotes`,
  `/api/admin/backfill-fx`, `/api/admin/backfill-history`) or the "Members" allowlist feature — those are
  unrelated existing admin tooling and stay as-is unless the architect's chosen role mechanism requires
  touching `isAdminEmail()` itself (see Open Questions).

---

## AC-1: Role system (durable, server-checked admin designation)

**AC-1.1 — Role is stored durably per user, not just in an env var**
- **Given** a user account exists in the system
- **When** an admin (or system) designates that account as "admin"
- **Then** that designation is persisted in a way that (a) survives a redeploy, (b) is queryable per
  user, and (c) can be changed without a code change or redeploy (required to satisfy AC-6's "edit
  role from the panel").

**AC-1.2 — Role is checked server-side on every admin-panel request, not derived from client state**
- **Given** any request to an admin-panel page or an admin-panel API endpoint
- **When** the request is handled
- **Then** the server independently re-derives the caller's role from the authenticated session/DB on
  that request (never trusts a client-supplied role, cached client state, or hidden-vs-shown UI as the
  access decision).

**AC-1.3 — Default-deny**
- **Given** a brand-new user account (freshly signed up, or any account where role has never been
  explicitly set to admin)
- **When** its role is evaluated
- **Then** it is treated as a regular (non-admin) user — admin status is opt-in only, never a default
  or a fallback on missing/unreadable role data.

**AC-1.4 — At least one admin must always exist**
- **Given** the current set of admin accounts
- **When** an action would remove the last remaining admin (demote-to-regular or delete the account)
- **Then** the action is rejected with a clear error, preventing the system from ever having zero admins.

---

## AC-2: Access control (admin panel unreachable by non-admins, server-enforced)

**AC-2.1 — Non-admin hitting an admin page URL directly is blocked, not just hidden from nav**
- **Given** a signed-in regular (non-admin) user
- **When** they navigate directly to an admin-panel page URL (not via any UI link)
- **Then** the server responds with a redirect away from the page or an explicit "forbidden" state
  (no admin-panel content, including no user list/detail data, is ever rendered or sent to the client).

**AC-2.2 — Non-admin calling an admin API endpoint directly is blocked**
- **Given** a signed-in regular (non-admin) user with a valid session
- **When** they call any admin-panel API endpoint directly (e.g. via curl/fetch with their own valid
  session cookie, bypassing the UI entirely)
- **Then** the server responds `403 Forbidden` (or equivalent) and performs no read or write of another
  user's data.

**AC-2.3 — Signed-out visitor hitting an admin URL is blocked**
- **Given** no active session
- **When** an admin-panel page or API URL is requested
- **Then** the request is redirected to sign-in (page) or rejected with `401`/`403` (API) — same as the
  existing `requireCurrentUser()` pattern elsewhere in the app.

**AC-2.4 — Admin-panel UI (nav links, buttons) is hidden from non-admins, in addition to (not instead
of) the server-side gate**
- **Given** a signed-in regular user
- **When** they use the app normally
- **Then** no link, nav item, or button pointing at the admin panel is rendered for them — this is a UX
  nicety layered on top of AC-2.1/2.2, never a substitute for them.

**AC-2.5 — Every admin panel route is covered, not just the top-level page**
- **Given** the full set of admin-panel routes (list view, user-detail view, edit, delete, impersonate,
  and their backing API endpoints)
- **When** each is enumerated
- **Then** each one independently performs the AC-1.2 server-side role check — a route added later that
  forgets the check is treated as a bug, not an acceptable gap (this should be verifiable by a shared
  test helper or a single enforced choke point per the architect's design).

---

## AC-3: User list view

**AC-3.1 — Admin sees all user accounts**
- **Given** an admin viewing the panel's user list
- **When** the list loads
- **Then** every user account in the system is listed (this AC uses "all users" to mean all
  non-deleted accounts currently in the `user` table — see Open Questions on the word "active").

**AC-3.2 — Signup date is shown per user**
- **Given** the user list
- **When** displayed
- **Then** each row shows that user's account-creation date (`user.createdAt`).

**AC-3.3 — "Did they upload something" signal is shown per user, and is accurate**
- **Given** the user list
- **When** displayed
- **Then** each row indicates whether that user has at least one `imports` row (i.e. has successfully
  processed at least one broker statement) — shown as, at minimum, a yes/no or count, and SHOULD also
  show the most recent import's date where present. A user with zero `imports` rows is shown as never
  having uploaded, even if they have a connected broker account or Coinbase connection with no
  successful import yet.

**AC-3.4 — List is usable at real scale**
- **Given** the list may grow as sign-ups increase
- **When** an admin opens the user list
- **Then** the view remains usable (paginated, sorted by a sensible default such as most-recent signup
  first, or both) rather than rendering every row unbounded — exact mechanism left to the architect,
  but "loads and is legible with hundreds of users" is the testable bar.

**AC-3.5 — List links through to a per-user detail view**
- **Given** the user list
- **When** an admin selects a user
- **Then** they reach a detail view for that specific user, which is the entry point for AC-4/5/6's
  actions (delete, impersonate, edit).

---

## AC-4: Account deletion ("totally delete")

**AC-4.1 — Deletion requires explicit, high-friction confirmation**
- **Given** an admin viewing a target user's detail page
- **When** they initiate account deletion
- **Then** the system requires an explicit confirmation step beyond a single click — at minimum, a
  confirmation dialog that states the action is permanent and irreversible; the confirmation SHOULD
  require the admin to type an unambiguous identifier of the target account (e.g. its email) before the
  delete button is enabled, to guard against selecting the wrong row.

**AC-4.2 — Deletion is blocked for the admin's own account via this flow**
- **Given** an admin viewing their own account in the panel
- **When** they attempt to delete it
- **Then** the action is rejected (self-deletion, if desired at all, is out of scope for this panel —
  it's a different, higher-stakes flow than "admin manages other users").

**AC-4.3 — "Totally delete" removes the auth record**
- **Given** a confirmed deletion
- **When** it completes
- **Then** the `user` row, and all rows in `session` and `account` tied to that user, no longer exist.

**AC-4.4 — "Totally delete" removes all owner-scoped financial/tax data**
- **Given** a confirmed deletion
- **When** it completes
- **Then** zero rows remain in every owner-scoped table for that user: `brokerAccounts`, `imports`,
  `instruments`, `transactions`, `positions`, `taxReports`, `taxReportLines`, `lots`,
  `realizedMatches`, `userSettings`, `cryptoAccounts`, `cryptoWallets`, `cryptoDailyValues` (the same 13
  tables the existing `auth-cleanup` abandoned-account safeguard already enumerates). Because these
  already cascade at the DB FK level on `user.id` deletion, this AC is primarily a **verification**
  requirement (deletion must go through the path that actually deletes the `user` row, not a
  soft-delete/flag that leaves this data orphaned) rather than new cascade logic.
- **Note:** there is no separate raw "uploaded document" store to purge (see §0) — the `imports` rows
  covered above are the complete record of what was uploaded.

**AC-4.5 — Deletion is logged for accountability**
- **Given** a confirmed deletion
- **When** it completes
- **Then** a durable record exists of which admin deleted which account and when — sufficient to answer
  "who deleted this user and when" after the fact, even though no dedicated log-viewing UI is required
  (see §2 Out of scope). This is new capability (no audit-log table exists in the schema today) — flagged
  for the architect.

**AC-4.6 — Deletion is not silently partial**
- **Given** a confirmed deletion
- **When** any step of the deletion fails partway through
- **Then** the failure is surfaced to the admin (not swallowed), and the system does not end up in a
  state where the user can still sign in but their data is gone, or vice versa.

---

## AC-5: Impersonation ("log in as this user")

**AC-5.1 — Impersonation is initiated explicitly, from the user detail view, with confirmation**
- **Given** an admin viewing a target user's detail page
- **When** they choose to impersonate
- **Then** the system requires an explicit confirm step (lighter-weight than AC-4.1's deletion
  confirmation, but not a single ambiguous click either) before starting the impersonated session.

**AC-5.2 — Impersonation is visually unmistakable for the entire duration**
- **Given** an active impersonation session
- **When** the admin views any page of the app while impersonating
- **Then** a persistent, non-dismissible-without-exiting banner/indicator is visible showing (a) that
  this is an impersonated session and (b) which user is being impersonated (name/email) — it must not
  be possible to mistake the impersonated view for the admin's own account or for that user's own
  ordinary session.

**AC-5.3 — Impersonation has a bounded, explicit expiry**
- **Given** an active impersonation session
- **When** time passes without the admin exiting
- **Then** the impersonated session automatically ends after a defined maximum duration (exact duration
  is an architecture decision, not specified here) rather than persisting indefinitely.

**AC-5.4 — Impersonation is explicitly exitable at any time**
- **Given** an active impersonation session
- **When** the admin clicks "exit impersonation" (available from the banner on every page)
- **Then** the session immediately reverts to the admin's own normal session, landing back in the
  admin panel (not the impersonated user's own dashboard).

**AC-5.5 — Impersonated session cannot perform account-security-sensitive actions on the target**
- **Given** an active impersonation session
- **When** the "admin-as-user" attempts to change the target's password, change the target's email,
  change the target's role, delete the target's account, or start a further/nested impersonation
- **Then** all such actions are blocked, even though the impersonating admin does have those
  permissions in their own admin identity — impersonation is scoped to viewing/troubleshooting as the
  user, not to using the user's identity as a vector for admin-level account changes. (Whether
  *non-security-sensitive, ordinary app actions* — e.g. viewing Pulse/tax pages, or interacting with
  in-app settings the user themselves could change — are permitted during impersonation is an open
  product question; see §Open Questions. This AC only pins down the security-sensitive floor.)

**AC-5.6 — Impersonation start and end are logged**
- **Given** an impersonation session starts or ends (including auto-expiry)
- **When** it does
- **Then** a durable record exists of which admin impersonated which user, and when it started/ended —
  same accountability bar as AC-4.5.

**AC-5.7 — Admin cannot impersonate themselves**
- **Given** an admin viewing their own account in the panel
- **When** they look for an impersonate action
- **Then** it is not offered (impersonation only applies to other users' accounts).

---

## AC-6: Edit account

**AC-6.1 — Editable fields are limited to what the schema actually supports plus the new role field**
- **Given** an admin viewing a target user's detail page
- **When** they edit the account
- **Then** the editable fields are drawn from what's real in this codebase's `user` schema — `name` and
  `email` — plus the new durable `role` field this feature introduces (AC-1.1). Internal/transient
  fields (`id`, `signupAttemptId`, `createdAt`, `updatedAt`) are not editable. Whether `emailVerified`
  and/or a ban/suspend capability are in scope is an open product question (see §Open Questions) — not
  assumed here since neither was explicitly requested and neither exists in the schema today.

**AC-6.2 — Editing a user's email does not silently bypass the existing verification gate**
- **Given** an admin changes a target user's email address
- **When** the change is saved
- **Then** the resulting state is consistent with the existing email-verification-gate behavior (i.e.
  the app does not end up treating an unverified new address as verified merely because an admin typed
  it in) — exact mechanism (re-trigger verification vs. admin-set-and-trust) is an architecture/product
  decision, but AC-6.2 requires the decision be made deliberately, not left as an accidental gap.

**AC-6.3 — Role edits respect AC-1.4 (last-admin guard)**
- **Given** an admin edits another user's role field
- **When** the edit would leave the system with zero admins
- **Then** it is rejected (same guard as AC-1.4, reachable via the edit-account path specifically since
  that's the mechanism through which role changes happen).

**AC-6.4 — Edits are logged**
- **Given** an admin saves a change to a target user's account
- **When** the change is saved
- **Then** a durable record exists of what changed, by which admin, and when — same accountability bar
  as AC-4.5/AC-5.6.

**AC-6.5 — Non-admin cannot edit their own role or any account via this panel's endpoints**
- **Given** a regular user
- **When** they attempt to call the edit-account API directly (including trying to set their own `role`
  to admin)
- **Then** the request is rejected per AC-2.2 — this is the specific privilege-escalation case worth
  calling out explicitly given AC-6.1 makes `role` an editable field.

---

## Traceability

| Requirement (from raw request) | AC(s) |
|---|---|
| Only admins can access the panel | AC-1, AC-2 |
| See all active users, signup date, upload signal | AC-3 |
| Totally delete a user's account | AC-4 |
| Log in under a user's account, see their data | AC-5 |
| Edit a user's account | AC-6 |
| Role system correctly defined, admin-only | AC-1, AC-2 |

---

## Open Questions / Risks (for architect + product to resolve before/while designing)

1. **Role storage mechanism conflicts with the existing `ADMIN_EMAILS` gate.** The current admin
   mechanism (`isAdminEmail()`/env var) cannot support AC-6's "edit role from the panel" without a
   redeploy per change. The architect must decide: (a) migrate to a DB-backed `role` column (e.g. via
   better-auth's built-in `admin` plugin, already available in the installed `better-auth` version with
   no new dependency) as the single source of truth, and either retire `isAdminEmail()`/`ADMIN_EMAILS`
   or keep it as an additional/bootstrap check; or (b) some other durable mechanism. This is a
   consequential architecture decision, not resolved by this AC doc.
2. **"Active users" wording.** The raw request says "see all active users." This AC (AC-3.1) interprets
   "active" as "not deleted / currently existing," not "currently logged in" or "recently used the app
   in the last N days" (no such recency signal exists in the schema today — closest proxy would be
   `session.updatedAt`/`expiresAt` or the newest `imports.createdAt`). If product actually wants a
   recency/engagement signal on the list, that's an additive AC, not assumed here.
3. **Should Coinbase (`cryptoAccounts`) connections count toward the "did they upload something"
   signal?** Currently scoped strictly to `imports` rows (file-based statement uploads) per the
   requester's literal wording. Product may want a broader "has any data" signal instead.
4. **Scope of "totally delete" vs. existing GDPR erasure story.** This is the product's first
   UI-triggered account deletion (see §0). Product/legal should confirm whether this admin-initiated
   deletion is meant to also serve as the mechanism for responding to a user's GDPR Art. 17 erasure
   request (in which case additional requirements — e.g. response-time tracking, confirming to the
   *user* that erasure completed — may apply), or whether it's purely an admin housekeeping tool and
   the contact-based erasure process referenced in `docs/CHANGELOG.md` stays the GDPR-facing path.
   Also unresolved: whether any **third-party** systems (Resend's mailing/send records, Vercel
   Analytics) hold data tied to the deleted user that this feature is expected to reach — not verified
   in this pass.
5. **Impersonation's write scope.** AC-5.5 pins down what's *forbidden* during impersonation
   (account-security-sensitive actions). It does not resolve whether impersonation is otherwise
   **read-only** (admin can only *view* the user's Pulse/tax data, matching the requester's literal "see
   their data") or **fully interactive** (admin can act as the user — upload a statement, change
   settings — which is often the actual point of support impersonation, but is a materially bigger
   attack surface and GDPR consideration). The requester's phrasing ("login under their account")
   leans toward interactive; "see their data" leans toward read-only. This needs an explicit product
   call before the architect designs the permission boundary.
6. **`emailVerified` / ban-suspend capability.** Not requested explicitly, but a natural, low-cost
   addition given better-auth's admin plugin provides ban/unban for free if that plugin is adopted
   (Open Question 1). Left out of AC-6.1's required scope; flagged as a candidate for the architect to
   propose back to product rather than build unrequested.
7. **Audit log storage.** AC-4.5/5.6/6.4 require *some* durable record of destructive/sensitive admin
   actions, but no audit-log table exists in the schema today and none is designed here — this is new
   schema/architecture work, not a reuse of something existing.

## Handoff

- Next: `architect` designs against this doc (role-storage mechanism, admin-panel route structure,
  impersonation implementation, deletion transaction/ordering, audit-log shape) — Open Questions 1, 4,
  and 5 above are architecture-blocking and should be resolved (or explicitly deferred with a stated
  default) before implementation starts.
- Once shipped, `documentation-writer` should add a `docs/INDEX.md` entry under Business Logic (role
  system + admin panel) and fold the account-deletion behavior into the GDPR data-lifecycle doc
  (`docs/superpowers/specs/2026-08-05-open-signup-data-lifecycle.md` or its eventual durable home),
  since it changes the "no self-service account-deletion UI exists yet" statement currently in
  `docs/CHANGELOG.md`.

---

## Resolved decisions (product sign-off, 2026-08-08)

**Resolves Open Question 5 (impersonation write scope).** Impersonation is
**fully interactive, full parity with the target's own session** — no
impersonation-specific action blocks beyond what's structurally true anyway
(impersonated session carries the target's own role, so it cannot reach the
admin panel itself; bounded expiry per AC-5.3 still applies). This
**supersedes AC-5.5 as originally written**: the "security-sensitive actions
blocked" floor (password/email/role change, delete, nested impersonation) is
**removed**. Concretely:
- Admin-as-user **can** change the target's own password/email through the
  same self-service flows the target would use themselves.
- Admin-as-user **cannot** delete the target's account or reach admin-panel
  routes during impersonation — not because of a new impersonation-specific
  rule, but because self-service account deletion doesn't exist for regular
  users at all (§2 Out of scope) and the admin panel requires `role ===
  "admin"`, which an impersonated session never carries (it's the target's
  role).
- Nested impersonation remains structurally impossible for the same reason
  (impersonated session is never treated as admin), independent of whether
  the target happens to hold the admin role.
- AC-5.6 (impersonation start/end logged) and AC-5.2 (visible banner) are
  unchanged — this decision is about *capability*, not about removing
  traceability of impersonation itself.

**Resolves Open Question 4 (GDPR erasure designation).** Admin-triggered
deletion (AC-4) **is** the GDPR Art. 17 erasure mechanism for this app. This
supersedes AC-4's framing as "purely admin housekeeping": it is now the
canonical erasure path, and `docs/CHANGELOG.md`'s "erasure is contact-based
only" line becomes stale once this ships and must be corrected by
`documentation-writer`. Follow-on items this decision opens (not blocking
this feature's build, but should be tracked):
- Whether any third-party processor (Resend, Vercel Analytics) holds data
  tied to the deleted user that this feature doesn't currently reach —
  unverified, flagged for follow-up, not resolved here.
- The existing contact-based erasure process should be updated to route
  through this admin-panel deletion going forward, rather than remaining a
  separate, undocumented manual process.

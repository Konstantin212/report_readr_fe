# Open Self-Service Sign-Up — Data Processes & Data-Lifecycle Inventory (AC-25…AC-29)

**Date:** 2026-08-05
**Status:** Design-stage input for `developer` / later `documentation-writer`
**Author:** architect
**Companion to:** `docs/superpowers/specs/2026-08-05-open-signup-design.md` (Amendment 1,
§19 of that document is the AC-25…AC-29 deliverable this doc's §19 points to).
Kept as a separate file per `documentation-standards`'s one-concept-per-file
rule and the AC doc's own Section 9 instruction (data-governance/GDPR
inventory is a distinct concept from sign-up *behavior*).

This is not yet a durable `docs/` entry — once the feature ships,
`documentation-writer` should fold the relevant, still-true parts of it
into wherever the app's durable data-governance doc lives (or create one
under `docs/` if none exists — did not find one in `docs/INDEX.md`) and
add a `docs/INDEX.md` entry per the AC doc's Section 9. Everything below is
verified against `src/lib/db/schema.ts` and the better-auth source
directly (not assumed) during this design pass.

**Update (2026-08-06):** the design doc's §23 (6-month abandoned-account
deletion sweep) and §24 (OAuth-token nulling) have since resolved two of
this doc's own open findings — AC-28 §3 and one line of AC-26. Both spots
below are updated in place, with the original finding kept and marked
resolved rather than deleted, per this doc's own "restated, not
re-litigated" discipline elsewhere.

**Update (2026-08-06, second amendment):** the Email Verification Gate
feature (`docs/superpowers/specs/2026-08-06-email-verification-gate-design.md`
§2/§9, `docs/superpowers/specs/2026-08-06-email-verification-gate-ac.md`
§9) introduces one genuinely new piece of server-side state, the
`signupAttempts` table — a correlation table for granting a session on a
second device once a fresh sign-up's email is verified. Per that design
doc's own §9 flag ("if the chosen cross-device mechanism introduces any new
server-side state, it must be added to the existing data-lifecycle
inventory"), it is added below to AC-26 and AC-28 rather than filed as a
separate doc, since it's the same "table/column data inventory" and
"erasure/retention analysis" concept this file already owns.

**Update (2026-08-08):** the Role System & Admin Panel feature
(`docs/superpowers/specs/2026-08-08-admin-panel-ac.md`,
`docs/superpowers/specs/2026-08-08-admin-panel-design.md`) ships the app's
first UI-driven account-deletion path and, per explicit product sign-off on
2026-08-08 (design doc §15), that admin-triggered deletion **is** the app's
GDPR Art. 17 erasure mechanism — not a separate/future feature. This
supersedes AC-28 §3's framing (and this doc's own § below, and
`docs/CHANGELOG.md`'s 2026-08-05 entry) that erasure is "contact-based
only." See the new AC-28 §4 below for the mechanism and its still-open
gaps. This does not change anything about AC-25/26/27/29 above — no new
sign-up-flow tables or third-party processors are introduced by the admin
panel feature itself (its own new table, `admin_audit_log`, is documented
in the admin-panel design doc §3.4, not here, since it is not part of the
sign-up data flow this doc inventories).

---

## AC-25: process inventory (sign-up, OAuth sign-up, email verification, password reset, admin allowlist toggle)

For each process: what triggers it, what's read/written, what third
parties are involved.

### 1. Credential (email + password) sign-up

- **Trigger:** `POST /api/auth/sign-up/email` (via `authClient.signUp.email`,
  called from `src/components/auth/auth-card.tsx`).
- **Reads:** `user` table (existence check, for the duplicate-email branch —
  design doc §4), `allowed_emails` table only if `AUTH_SIGNUP_MODE=restricted`.
- **Writes:** new `user` row (`id`, `name` if provided, `email`,
  `emailVerified: false`, `createdAt`/`updatedAt`); new `account` row with
  `providerId: "credential"` and a hashed `password` (better-auth's own
  scrypt-based hasher — never plaintext); new `session` row (auto-sign-in,
  design doc §3/§4).
- **Side effect:** triggers process 3 below (`emailVerification.sendOnSignUp: true`).
- **Parties:** first-party only (this app + its Postgres/Neon database) up
  to this point; process 3 is the first point a third party (Resend) is
  involved.

### 2. OAuth (Google/GitHub) sign-up

- **Trigger:** OAuth redirect flow via `authClient.signIn.social(...)`.
- **Reads:** `allowed_emails` only if restricted mode; `account` table
  (existing-account-linking check).
- **Writes:** new `user` row with `emailVerified` set from the **provider's
  own claim** (Google `email_verified` OIDC claim / GitHub's per-email
  `verified` flag from its `/user/emails` API — design doc §14, not
  hardcoded `true`); new `account` row with `providerId: "google"` /
  `"github"`, `accessToken`/`refreshToken`/`idToken` (OAuth tokens, stored as
  returned by the provider — no separate encryption-at-rest beyond
  Neon's own storage-level encryption; flagged data-minimization note
  in AC-26 below, **now resolved by design doc §24**); new `session` row.
- **Side effect:** in the narrow edge case where the provider itself
  reports the email as unverified, this **also** triggers process 3
  (design doc §14's verified nuance) — a real interaction between two
  processes, not two independent processes.
- **Parties:** OAuth provider (Google or GitHub) receives the user's
  request to authenticate and returns profile data (email, name, avatar
  URL, verification claim) to the app — a data flow **out and back
  into** the app that already existed before this feature (unchanged by
  this amendment); this doc doesn't re-litigate that pre-existing
  integration's own GDPR posture, only notes it's a party in this process.

### 3. Email verification

- **Trigger:** automatic after process 1, or manually via
  `authClient.sendVerificationEmail({ email })` ("resend" action, design
  doc §11).
- **Reads:** `user` table (to check `emailVerified` isn't already true —
  short-circuits with no email sent if so).
- **Writes to our DB:** **none.** The token is a stateless, signed JWT
  (`BETTER_AUTH_SECRET`-signed, verified in design doc §13) — no
  `verification` table row is created for this flow.
- **Third party:** the token + a verification link is emailed via **Resend**
  (see AC-27).
- **On click:** `GET /api/auth/verify-email?token=...` — reads/verifies the
  JWT (no DB read for the token itself), writes `user.emailVerified = true`.

### 4. Password reset

- **Trigger:** `authClient.requestPasswordReset({ email })` (the new
  "Forgot password?" flow, design doc §16).
- **Reads:** `user` table (existence check — but see below, response is
  anti-enumerating regardless of the answer).
- **Writes:** a real `verification` table row —
  `identifier: "reset-password:<token>"`, `value: <userId>`, `expiresAt`
  (design doc §13). **This is the one process in this inventory that
  leaves a durable DB row that isn't automatically cleaned up by
  better-auth** — see AC-28.
- **Third party:** the reset link is emailed via **Resend** (AC-27).
- **On completion:** `POST /api/auth/reset-password` — reads/deletes the
  `verification` row (true one-time-use, design doc §13), writes a new
  hashed `account.password`, and (once `revokeSessionsOnPasswordReset: true`
  is set per design doc §12) **deletes all of that user's `session` rows**
  — a write to the `session` table as a direct consequence of this process.

### 5. Admin allowlist toggle (`allowed_emails` add/remove via Settings)

- **Trigger:** an admin (per `src/lib/auth/admin.ts`'s `isAdminEmail` check)
  adding/removing a row via `src/components/pulse/members-manager.tsx`.
- **Writes:** `allowed_emails` row (`email`, optional `note`, `addedAt`,
  `addedByUserId` — a self-referential FK to `user.id`, `onDelete: "set
  null"` if the admin's own account is later deleted).
- **Reads:** consulted only by process 1/2's `databaseHooks.user.create.before`
  hook, and **only when `AUTH_SIGNUP_MODE=restricted`** (design doc §2) —
  in the new default (`open`) mode, this table is written to but never
  read by the auth flow at all, a genuine behavior change from before this
  feature (flagged in the design doc's UI-copy section, §6.3, so the admin
  UI doesn't misrepresent this).

---

## AC-26: table/column data inventory

| Table | Column(s) | Populated by | Notes |
|---|---|---|---|
| `user` | `id`, `email`, `name`, `image` | Sign-up/OAuth (processes 1/2) | `email` unique; `name`/`image` only present for OAuth sign-ups today (credential sign-up currently collects only email+password — no name field in `auth-card.tsx`'s design, design doc §6.2) |
| `user` | `emailVerified` | Processes 1 (`false` initially), 2 (from provider claim), 3 (flips to `true`) | See design doc §13/§14 for exact semantics — this is the only column this whole feature repeatedly reads/writes as its central piece of state |
| `account` | `providerId`, `accountId` | Processes 1/2 | `"credential"` vs `"google"`/`"github"` |
| `account` | `password` | Process 1 (set), process 4 (overwritten) | Hashed (scrypt, better-auth default) — never plaintext at rest or in transit beyond the initial HTTPS submission |
| `account` | `accessToken`, `refreshToken`, `idToken` | Process 2 only | OAuth provider tokens, stored as-is; **data-minimization note (originally flagged by this doc):** better-auth stores these regardless of whether this app currently uses them for anything beyond initial authentication (no evidence in this codebase of calling back to Google/GitHub APIs post-sign-in). **RESOLVED (2026-08-06): design doc §24** — these columns are now nulled going forward (`databaseHooks.account.create.before`) and backfilled to `NULL` for existing OAuth rows via a one-time migration statement; only `providerId === "credential"` rows keep a token-shaped column (`password`) populated |
| `session` | all columns, incl. `ipAddress`, `userAgent` | Every sign-in (processes 1/2, and implicitly re-created by 4) | `ipAddress`/`userAgent` are personal data (IP address is squarely in-scope PII under GDPR); deleted on logout or cascade-deleted with the user; also explicitly deleted in bulk by process 4 (`revokeSessionsOnPasswordReset`) |
| `verification` | all columns | Process 4 only, for this feature (process 3 uses a stateless JWT and never touches this table) | `value` holds the reset-target `userId` in plaintext (not itself sensitive beyond being a foreign-key value) but `identifier` embeds the raw reset token — **this token is a bearer credential for a password reset; the `verification` table itself should be treated as sensitive**, not just administrative metadata |
| `signup_attempts` | `id`, `attempt_id`, `user_id`, `expires_at`, `consumed_at`, `created_at` | Email Verification Gate feature (2026-08-06), not the original 2026-08-05 processes above — see the update note at the top of this doc | Correlates a fresh credential sign-up to its cross-device session-claim poll. `attempt_id` is a client-generated opaque UUID, never derived from or containing email/name/any identifying value; `user_id` is a plain FK to `user.id` (`onDelete: "cascade"`). No PII beyond that FK. `expires_at` mirrors the 1-hour email-verification token TTL; `consumed_at` is set once the row is used to grant a session (one-time-use). Design doc §11 covers the GDPR data-minimization reasoning explicitly (data never outlives its single-use purpose by more than the daily cleanup-sweep cadence). |
| `user` | `signup_attempt_id` | Email Verification Gate feature (2026-08-06) | Transient, `returned: false` passthrough column — never appears in any sign-up API response. Written on sign-up if a `signupAttemptId` was supplied, then nulled again within the same request once mirrored into the durable `signup_attempts` row above (design doc §2.2) — so at rest, outside a brief in-request window, this column is always `NULL`. |
| `allowed_emails` | `email`, `note`, `addedByUserId` | Process 5 | `note` is a free-text field an admin controls — flag as a place arbitrary personal data *could* be entered (e.g. an admin writing "John's personal email, DOB 1990" in the note) even though nothing in this feature requires or encourages that; no technical control prevents it today, purely a process/training matter |

**Cross-cutting note carried over from design doc §13:** the `verification`
table is used by **both** password-reset (this feature) and potentially
other better-auth plugins in the future (e.g. email-OTP, magic links) —
the AC-28 cleanup cron (below) targeting `expires_at < now()` on this whole
table is intentionally generic for that reason, not narrowly password-reset-specific.

---

## AC-27: Resend as a new third-party subprocessor

**This is a genuinely new subprocessor relationship introduced by this
feature** (design doc §5/§14 — no outbound-email provider existed in this
codebase before). Flagging explicitly for a `gdpr-compliance` follow-up
review, not resolving the full DPIA/subprocessor-agreement question here
(that's a legal/contractual step, not an architecture one):

- **Data sent to Resend, per email:** recipient email address, subject
  line, and an HTML body containing either a verification link
  (`?token=<JWT>`) or a password-reset link (`?token=<DB-row-id>`) —
  see `src/lib/auth/auth-emails.ts`'s exact templates (verified in full,
  design doc grounding section). No other user data (name, financial
  data, tax figures) is ever included in these emails — the templates are
  minimal by design (`sendVerificationEmail`/`sendResetPasswordEmail` only
  interpolate `url` into the body; `user.name` is accepted as a parameter
  but is **not currently used** in either template — confirmed by reading
  `verificationEmailHtml`/`resetPasswordEmailHtml`, take only `url`).
- **Region:** sending domain (`mail.ptfolio.net`, per design doc §17's
  reference — Resend domain verification already completed) — the
  region Resend actually processes/stores data in (`eu-west-1` per a
  prior design's grounding note, inherited from an earlier developer
  pass, **not independently re-verified by me in this session** — flag for
  `gdpr-compliance`/whoever configured the Resend account to confirm
  this against Resend's own dashboard/DPA, not assumed from the prior note).
- **Retention on Resend's side:** governed by Resend's own DPA/retention
  policy, not this app's code — outside this doc's ability to verify from
  the repo; a subprocessor-disclosure and DPA-review action item for
  `gdpr-compliance`, not a design decision.
- **Required disclosure:** once a privacy-policy page exists (AC-29,
  still absent — see below), Resend needs to be named in it as a
  subprocessor, alongside Neon (already a subprocessor via the app's core
  Postgres hosting, pre-existing) and the OAuth providers themselves
  (Google/GitHub, pre-existing).

**Update (2026-08-06):** a privacy-policy page has since shipped
(`src/app/privacy/page.tsx`, design doc §26) naming Resend, Vercel, Neon,
Google/GitHub, and Coinbase as subprocessors. The region/DPA
re-verification action item above is **still open** — the page carries
the same unverified placeholder, not a newly-confirmed fact.

---

## AC-28: erasure/retention analysis

Three distinct scopes, deliberately not conflated (per the design doc §18's
own point that "token cleanup" and "abandoned-account deletion" are
different-sized decisions):

### 1. Password-reset token rows (`verification` table) — decided, in scope

Per design doc §18: a new `src/app/api/cron/auth-cleanup/route.ts`
(`DELETE FROM verification WHERE expires_at < now()`), triggered daily via
a new GitHub Actions workflow mirroring `quotes-refresh.yml`. This is the
one piece of AC-28 that's a settled, low-risk design decision already
(design doc §18/§20/§21) — restated here for completeness of this
inventory, not re-litigated.

### 2. Email-verification tokens — no action needed

Per design doc §13: stateless JWTs, never persisted to any table. Nothing
to erase. Their only "retention" is implicit in `BETTER_AUTH_SECRET` itself
(rotating the secret invalidates all outstanding tokens instantly, as a
side effect of secret rotation generally, not something this feature adds
new machinery for).

### 2a. `signup_attempts` rows — decided, in scope (added 2026-08-06, Email Verification Gate)

Per the Email Verification Gate design doc §2.4: `runAuthCleanup()`
(`src/lib/auth/auth-cleanup.ts`) gains a third sweep, alongside the
pre-existing expired-`verification`-row delete described in scope 1 above —
`DELETE FROM signup_attempts WHERE expires_at < now() OR consumed_at IS NOT
NULL`. Same trigger, same cadence (daily, via the existing
`auth-cleanup` cron route/workflow) — **no new cron mechanism was
introduced**. Unconditional, like the `verification` sweep (not gated
behind `AUTH_CLEANUP_DELETE_ENABLED`), since an expired or already-consumed
row carries no user-identifying value once past that point. Independently,
`onDelete: "cascade"` on `signup_attempts.user_id` means the existing
abandoned-account deletion sweep (scope 3 below) also removes any
lingering `signup_attempts` row for that account automatically — this
table is deliberately excluded from that sweep's owner-data safeguard
list, on the same reasoning as `session`/`account`: it is auth mechanism,
not user-owned financial/tax data, so its mere presence must never block
deletion of an abandoned account.

### 3. Abandoned (never-verified) accounts — RESOLVED (2026-08-06): see design doc §23

**Original finding (kept below for the record, not deleted):** this is the
important, larger finding this data-lifecycle pass surfaced, building on
schema facts not previously connected in the design doc: if a
never-verified `user` row is ever deleted (a decision explicitly deferred
to the user in the design doc's §22, item 3), **the deletion cascades far
beyond the `user`/`account`/`session` rows**, because of `onDelete:
"cascade"` foreign keys already present in `src/lib/db/schema.ts` — at the
time of this doc's first draft I had verified only two of these
(`broker_accounts.owner_user_id`, `imports.owner_user_id`) and flagged
"very likely further cascades ... not exhaustively re-verified
table-by-table" as an open gap.

**That gap is now closed.** The user has confirmed the retention decision
(6 months, never-verified accounts only — design doc §22 item 3), and the
design doc's new §23 does the exhaustive table-by-table enumeration this
doc could only gesture at: **13** owner-scoped tables carry `onDelete:
"cascade"` FKs to `user.id` (not just the 2 named here originally) —
`broker_accounts`, `imports`, `instruments`, `transactions`, `positions`,
`tax_reports`, `tax_report_lines`, `lots`, `realized_matches`,
`user_settings`, `crypto_accounts`, `crypto_wallets`, `crypto_daily_values`.
See design doc §23.2 for the full table with `schema.ts` line references,
and §23.3 for the exact Drizzle `notExists(...)` safeguard query built
from that full list — **this doc's own narrower recommendation below
(checking only `broker_accounts`/`imports`) is superseded by that broader,
verified safeguard, not merely supplemented by it.**

Also resolved by §23: the deletion window (6 months from `user.createdAt`,
never-verified only — not a broader "dormant verified user" policy, a
reading §23.1 makes explicit and flags as needing its own separate
decision if ever wanted), the dry-run-first rollout gated by
`AUTH_CLEANUP_DELETE_ENABLED` (§23.4), and the audit trail (cron
console-log output only, captured by both the GitHub Actions run log and
Vercel's function logs — no dedicated audit-log table, per §23.4's
reasoning that one isn't warranted yet for a single, rare, already-logged
operation).

**Original recommendation (superseded, kept for the record):** for the
overwhelming majority of "abandoned, never-verified" accounts the cascade
is moot — a user who never verified their email also never got far enough
to import a broker statement. But it is not *impossible*:
`requireEmailVerification: false` (design doc §11, deliberately) means an
unverified user can sign in and use the full app, including importing
real financial statements, indefinitely. So an "auto-delete never-verified
accounts after N days" policy, if adopted, could delete real financial/tax
data a user has already entered, not just an empty, never-used `user` row
— which is exactly why §23.2's full 13-table safeguard (not the narrower
2-table one originally sketched here) is the version that actually shipped
into the design.

### Retention vs. statutory tax-record-keeping (cross-reference)

Per `gdpr-compliance`'s general guidance on this app (this is a pattern,
not new to this feature): German tax law imposes its own retention
obligations on financial/tax records independent of GDPR erasure requests.
This tension is **pre-existing to this app** (not introduced by open
signup) and out of scope for this specific doc to resolve, but worth
restating here since §3 above shows the tension is now reachable by a
broader, self-service population rather than 5 personally-vetted users —
raising the practical likelihood this conflict is actually hit, not just
theoretically possible. (Note this cross-reference is orthogonal to the
§23 sweep above: the §23 safeguard's entire point is that any account with
real financial/tax rows is excluded from auto-deletion in the first place,
so this tension is about a currently-nonexistent manual/self-service
erasure path for *verified* users with real data, not about the abandoned-
account sweep.)

### 4. Admin-triggered account deletion — the GDPR Art. 17 erasure path (added 2026-08-08)

Per the 2026-08-08 update note above, the Role System & Admin Panel feature
adds a `DELETE` action, reachable only by an admin at `/admin/users/[id]`,
that hard-deletes the target's `user` row. Because the same 13 owner-scoped
tables enumerated in §3 above (plus `session`/`account`) already carry
`onDelete: "cascade"` FKs to `user.id`, this single deletion statement
removes **all** of a user's data — auth records and financial/tax data
alike, verified and never-verified accounts alike — in one atomic step (see
admin-panel design doc §7.3). This is a materially different scope from the
§3 sweep above: §3 only ever touches never-verified, zero-owned-data
accounts after 6 months; this path can delete any account, including one
with real financial/tax history, at an admin's discretion, immediately.

- **Deliberately manual, not self-service.** There is still no flow for a
  user to delete their own account or submit an in-app erasure request (AC
  doc §2, "out of scope"); an admin must act. What changes is that when an
  admin does act — including in response to a user's erasure request
  received by whatever contact channel is used today — this deletion now
  **is** the canonical, complete erasure mechanism, not a partial one
  layered on top of a separate "contact-based" process.
- **Logged, not silent.** Every deletion writes an `admin_audit_log` row
  (`ACCOUNT_DELETE`: actor, target email snapshot, timestamp — see
  admin-panel design doc §3.4) before the target's own identity is gone
  from the `user` table, satisfying an accountability requirement this
  app's data-lifecycle story didn't previously have for erasure events.
- **Gaps carried forward, not resolved by this feature (design doc §12.2,
  restated as still-open here):**
  - **No confirmation loop back to the requesting data subject.** Nothing
    in this feature emails the user to confirm erasure completed — that is
    still a manual step for whoever is handling the request.
  - **Third-party processors are not touched.** Resend's own send/delivery
    logs and Vercel Analytics events tied to the deleted user's activity
    are not reached by this deletion. Whether this matters in practice is
    unverified (same open item as AC-27 above) — flagged, not
    investigated.
  - **The statutory tax-record-keeping tension noted just above (§3's
    cross-reference) applies here with more force, not less:** unlike the
    §3 sweep (which only ever targets zero-data accounts), this path lets
    an admin delete an account that *does* have real tax/financial
    history. Whether German tax-record retention law constrains when an
    admin should exercise this action is a legal question this doc does
    not resolve — it is restated here because this feature makes the
    conflict directly reachable via a UI action for the first time, not
    just a theoretical schema-level possibility.

---

## AC-29: privacy-policy gap (carried forward, not closed by this feature)

Confirmed (re-grepped `src/app` during this pass, independent of the
design doc's own earlier check): **no privacy-policy /
Datenschutzerklärung page or route exists anywhere in this codebase.**
This predates this feature and is explicitly not being fixed as part of
it (per the AC doc's own framing and the design doc's §7.3/§22).

What's different after this feature ships, restated here because it
changes the urgency, not the substance, of this gap:
- The app moves from 5 personally-invited, presumably-informed users to
  an unbounded public signup population who have never been told, at the
  point of collecting their email/password/OAuth profile data, what this
  app does with it (Art. 13 GDPR point-of-collection notice).
- A brand-new subprocessor (Resend, AC-27) and the newly-real use of the
  `account.password`/OAuth-token columns (AC-26) both need disclosure in
  whatever privacy notice is eventually written.

This doc does not propose privacy-policy copy (a legal/product
deliverable, not an architecture one) — it only re-confirms the gap still
exists and flags that this feature increases, rather than creates, the
risk of shipping without one.

**Update (2026-08-06):** RESOLVED per design doc §22 item 4 / §26 — a
real, first-draft privacy-policy page has shipped
(`src/app/privacy/page.tsx`). It is explicitly **not** a legally-reviewed
document (flagged prominently both in-page and in design doc §26) — that
caveat is restated here rather than this gap being marked closed without
qualification.

---

## Summary of open items this document surfaces for direct user sign-off (additive to design doc §22, not a duplicate list)

1. ~~Whether OAuth `accessToken`/`refreshToken`/`idToken` retention
   (AC-26) should be reviewed/nulled if genuinely unused
   post-authentication.~~ **RESOLVED (2026-08-06): design doc §24** — nulled
   going forward via a `databaseHooks.account.create.before` hook, and
   backfilled to `NULL` for existing rows via a one-time migration
   statement (§24.2).
2. Confirming Resend's actual processing region and DPA terms directly
   (AC-27) rather than relying on an inherited, unverified note. **Still
   open** — not part of the 2026-08-06 sign-off round; the privacy-policy
   page shipped in the meantime (§26) still carries this as an unconfirmed
   placeholder.
3. ~~The refined shape of the "abandoned account" decision (design doc §22
   item 3): specifically, whether any auto-deletion policy must first
   check for absence of `broker_accounts`/`imports` rows before acting,
   given the cascade-delete finding above.~~ **RESOLVED (2026-08-06):
   design doc §23** — and the shipped safeguard is broader than this
   item's own suggestion: all 13 owner-scoped tables (§23.2), not just
   `broker_accounts`/`imports`, gate the deletion, re-checked inside the
   same transaction as the delete itself (§23.3) to close the
   TOCTOU gap between listing candidates and deleting them.

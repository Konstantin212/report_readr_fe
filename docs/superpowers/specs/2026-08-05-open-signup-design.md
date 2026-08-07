# Open Self-Service Sign-Up — Design Spec

**Date:** 2026-08-05
**Status:** Ready for developer
**Author:** architect
**Input:** `docs/superpowers/specs/2026-08-05-open-signup-ac.md` (AC-1…AC-13, Sections 6/7)
**Related:** `docs/superpowers/specs/2026-05-18-portfolio-tax-app-design.md` (foundational
auth stack: Better Auth, Google + GitHub OAuth, `AUTHORIZED_EMAILS` allowlist —
this spec is its first revision decision)

This is a design-only document. No implementation code included except
illustrative config/pseudo-code the `developer` agent should finalize against
better-auth's actual types (verified below against installed
`better-auth@^1.2.0` package source, not from memory).

---

## 1. Grounding: what I verified in `node_modules/better-auth` before deciding

Because Open Questions 3–5 ask for exact better-auth behavior, I read the
installed package source for the API shape:

- `dist/context/create-context.mjs:182-183` — default
  `minPasswordLength: 8`, `maxPasswordLength: 128`. AC-3's "8 chars" floor is
  better-auth's own default; no custom validation code needed for the
  floor itself.
- `dist/api/routes/sign-up.mjs:160-205` — the duplicate-email branch depends
  on `requireEmailVerification || autoSignIn === false`. If either is true,
  better-auth returns a **synthetic, non-persisted "success" response**
  (anti-enumeration — an attacker can't tell the account existed). Otherwise
  it throws `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` (HTTP 422), **which does
  reveal the email is registered**.
- `dist/api/routes/sign-in.mjs:208-227` — wrong password, unknown email, and
  "no credential account" (e.g. an OAuth-only account attempting password
  sign-in) all collapse to the same `INVALID_EMAIL_OR_PASSWORD` error, so
  sign-in is already non-enumerating without extra work (AC-6).
- `dist/api/rate-limiter/index.mjs:185-198` — better-auth has a built-in
  special rate-limit rule for `/sign-in*`/`/sign-up*`: **3 requests/10s per
  IP**, on top of the general 100/10s default, active whenever
  `NODE_ENV === "production"` (true of this app's Vercel deploys today). The
  limiter's storage defaults to an in-process `Map` and is not shared across
  serverless instances — a real but not hard ceiling (see §7.1).
- `src/lib/db/schema.ts` already has `account.password` and `user.emailVerified`
  columns from the initial Better Auth Drizzle schema — no migration needed
  to store credential accounts or verification state.

---

## 2. Open Question 1 — the gate becomes opt-in via `AUTH_SIGNUP_MODE`

New env var, validated in `src/lib/env.ts`:

```ts
AUTH_SIGNUP_MODE: z.enum(["open", "restricted"]).default("open"),
AUTHORIZED_EMAILS: z.string().optional(), // was z.string().min(1)
```

- **Default `"open"`** — matches the stated goal (Section 2 of the AC doc)
  and requires zero env changes on any deployment for it to take effect.
  **This is exactly the "needs a human, not just an architect" decision
  flagged in the summary below** — Section 9.
- `"restricted"` re-enables today's `isEmailAllowedToSignIn` gate,
  unchanged, for anyone who wants to run a private instance later.
- New helper module `src/lib/auth/signup-mode.ts`:

```ts
export type SignupMode = "open" | "restricted";

export function getSignupMode(): SignupMode {
  return process.env.AUTH_SIGNUP_MODE === "restricted" ? "restricted" : "open";
}
```

This reads `process.env` directly rather than importing the parsed
`env` object from `lib/env.ts`. That's a deliberate consistency choice:
every other auth-module file (`allowlist.ts`, `admin.ts`, `setup.ts`)
already reads `process.env.X` directly with its own default/parsing, and
never imports `lib/env.ts` — see Section 4 for why `lib/env.ts` is
currently orphaned and how this spec fixes that at the boot layer only,
without changing this auth module's existing runtime-read convention.

### `databaseHooks.user.create.before` restructure (`src/lib/auth/setup.ts`)

```ts
databaseHooks: {
  user: {
    create: {
      before: async (user) => {
        if (getSignupMode() === "restricted" && !(await isEmailAllowedToSignIn(user.email))) {
          throw new Error("Email is not authorized for this private app.");
        }
        return { data: user };
      },
    },
  },
},
```

One conditional. Because better-auth's `internalAdapter.createUser` is the
common path for **both** social sign-in and `emailAndPassword` sign-up,
this single hook covers AC-1 (OAuth, open), AC-2 (password, open), AC-7
(unconditional open default), and AC-8 (any provider, restricted) without
provider-specific branching — no new module boundary needed, the existing
hook location is still the single point of enforcement.

`allowedEmails` table, `isEmailAllowedToSignIn`, the admin Members API
routes, and `isAdminEmail`/`ADMIN_EMAILS` are **all unchanged** — only the
call site becomes conditional. Update the doc-comment at
`src/lib/db/schema.ts:37-42` (currently: *"Only emails in this table ...
can complete the OAuth sign-up flow"*) to: *"Only enforced when
`AUTH_SIGNUP_MODE=restricted` (default is open self-service sign-up — see
`docs/superpowers/specs/2026-08-05-open-signup-design.md`). Kept, not
deleted, for anyone running a private instance."* This is a one-line
source comment the developer fixes as part of the same diff (not a
separate `documentation-writer` hand-off — `documentation-writer` still
owns `docs/INDEX.md` + `CHANGELOG.md` per Section 9 of the AC doc).

**No database migration.** `allowed_emails`, `user`, and `account` schemas
are untouched.

---

## 3. `emailAndPassword` config (Open Question 3)

`src/lib/auth/setup.ts`, added alongside `socialProviders`:

```ts
emailAndPassword: {
  enabled: true,
  requireEmailVerification: false, // no outbound-email provider exists yet — see §5
  minPasswordLength: 8,  // == better-auth's own default; explicit for clarity, not a behavior change
  maxPasswordLength: 128, // == better-auth's own default; explicit for clarity, not a behavior change
  autoSignIn: true, // MUST stay true — see enumeration trade-off, §4
},
```

`minPasswordLength`/`maxPasswordLength` are written explicitly even though
they match the library default, so the policy is visible in source and
doesn't silently drift if a future better-auth upgrade changes its
defaults. No complexity rules (uppercase/symbol requirements) — AC-3 only
mandates the length floor and better-auth doesn't offer complexity-rule
config out of the box; adding a custom Zod pre-check for complexity would
be scope creep not requested by the AC.

**(Amendment 1 note: superseded — see §15. The `requireEmailVerification: false`
line above stays `false` under Amendment 1's chosen resolution too, but a
new `emailVerification` block is added alongside it. Kept here unedited,
per changelog discipline, rather than silently rewritten.)**

---

## 4. Open Question 5 — account enumeration on duplicate sign-up

**Decision: accept better-auth's default (reveal-on-duplicate) behavior
for sign-up; keep sign-in fully non-enumerating (already free).**

The anti-enumeration path in better-auth's sign-up handler only activates
when `requireEmailVerification: true` **or** `autoSignIn: false`. Setting
either would break AC-2's hard requirement ("signed in and redirected to
`/` — with no check-your-inbox interstitial and no pending-approval
state") for every legitimate new sign-up, not just for duplicates. Since
the product ask (Section 2/4 of the AC doc) explicitly prioritizes
zero-friction immediate sign-in over hiding account existence, and AC-4
explicitly permits either resolution, this design keeps `autoSignIn: true`
and lets duplicate sign-up throw `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`
(422) — the client shows "An account with this email already exists —
sign in instead," no duplicate/orphaned row is created (satisfies AC-4
literally), and no custom server code is needed.

This is a real, if minor, account-enumeration surface (an attacker can
learn "this email has a Folio account" by attempting sign-up) — flag to
`code-reviewer`/`nextjs-security` at review time as an **accepted
trade-off**, not an oversight, and revisit only if/when email verification
is turned on (at which point the anti-enumeration path activates for
free as a side effect).

**(Amendment 1 note: this trade-off survives Amendment 1 unchanged — see
§12's explanation of why. Choosing `requireEmailVerification: true` would
have silently flipped this decision as a side effect; that interaction is
exactly why §12 recommends against it.)**

---

## 5. Open Question 4 — password reset: RESOLVED by Amendment 1 (see §16)

No outbound-email provider (Resend/SMTP/nodemailer) exists anywhere in
this codebase today (`package.json` has none). Password reset needs
`emailAndPassword.sendResetPassword` wired to a real mail provider — a
new integration with its own env vars/secrets, correctly scoped by the
business-analyst as its own follow-up feature, **not** bundled here.

Design implication for this feature: the sign-up/sign-in UI (§7) must
**not** render a "Forgot password?" link that dead-ends — omit it
entirely rather than pointing at an unimplemented flow. Do not configure
`emailAndPassword.sendResetPassword` at all in this change; its absence
is intentional, not an oversight, and should be called out again by
`documentation-writer` as a known gap once this ships (a real
external user who forgets a password has no self-service recovery path
until that follow-up ships — they'd need direct DB intervention or to
fall back to an OAuth provider on the same email).

**(Amendment 1: this is no longer a gap. Resend is now provisioned and
`sendResetPassword` is wired — see §16. Kept above unedited, per changelog
discipline, as the historical reasoning for why it was originally deferred.)**

---

## 6. UI copy and structure changes

### 6.1 `src/app/sign-in/page.tsx`

Convert from a `"use client"` page (today, hardcoding both OAuth buttons
unconditionally) into a **Server Component** that:

1. Calls `getEnabledAuthProviders()` — a function that already exists in
   `src/lib/auth/providers.ts` but **is currently dead code**: the
   sign-in page hardcodes "Continue with Google"/"Continue with GitHub"
   regardless of whether `GOOGLE_CLIENT_ID`/`GITHUB_CLIENT_ID` are set.
   That's a pre-existing latent bug (a misconfigured deploy would show a
   button that 500s on click) adjacent to this feature. Since the page is
   being rewritten anyway to add the password form, wire it up in the
   same diff — near-zero incremental cost, closes a real gap.
2. Calls `getSignupMode()` for the copy branch below.
3. Passes both down as props to a new client leaf component,
   `src/components/auth/auth-card.tsx`, which owns the interactive bits
   (OAuth button `onClick`s + email/password form + client-side
   validation) — keeping `"use client"` scoped to that leaf, per
   `react-best-practices`/App-Router convention, not the whole page.

Copy change (removes the literal "invite-only" line at
`src/app/sign-in/page.tsx:102-103`):
- `open` mode (the new default): something like *"Sign up free with
  Google, GitHub, or email + password."* — no mention of invitations.
- `restricted` mode: keep language close to today's, e.g. *"Sign-up is
  currently limited to invited emails — ask your workspace admin."*

**(§26: this page should also grow a small footer link to `/privacy`
once that page ships — see §26 for why that's flagged here rather than
built as part of this session's work.)**

### 6.2 New component: `src/components/auth/auth-card.tsx`

**(Amendment 1: this component does not exist yet — confirmed by
`Glob src/components/auth/**` returning no matches. The prior developer
pass built the email infra (`resend.ts`, `auth-emails.ts`) but did not
reach any UI work. Everything in this §6.2 remains to be built from
scratch, now inclusive of the Amendment 1 additions in §16.2.)**

- Renders OAuth buttons only for providers in the `providers` prop
  (fixes §6.1's dead-code gap).
- A toggle/tab between **Sign in** and **Create account**, both calling
  `authClient.signIn.email(...)` / `authClient.signUp.email(...)`
  (the client already exists at `src/lib/auth/client.ts`, and
  better-auth's `createAuthClient` auto-derives these methods from the
  server's enabled routes).
- Client-side pre-check: length ≥ 8, so the common case doesn't need a
  server round-trip; the server-side check (§3) remains the source of
  truth. Error-code mapping surfaces better-auth's `INVALID_EMAIL`,
  `PASSWORD_TOO_SHORT`, `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` (§4),
  and `INVALID_EMAIL_OR_PASSWORD` (generic "check your email and
  password") as user-facing copy.
- **(Amendment 1: add "Forgot password?" link — see §16.2. The original
  "no Forgot password link" instruction from §5 above is superseded.)**

### 6.3 `src/components/pulse/members-manager.tsx` + `src/app/(app)/settings/page.tsx` (Open Question 2)

**Resolution: keep the Members/allowlist section visible in both modes**
(an admin may want to pre-stage a restricted-mode allowlist before
flipping the switch later) but make the copy mode-neutral or
mode-conditional, driven by a single `signupMode` value computed
server-side in `settings/page.tsx` via `getSignupMode()` and passed down:

- Section subtitle (`settings/page.tsx:147-149`), conditional on mode:
  - `open`: *"This list currently has no effect — sign-up is open to
    anyone. Populate it now only if you plan to switch this workspace to
    restricted mode later (`AUTH_SIGNUP_MODE=restricted`)."*
  - `restricted`: keep close to today's — *"Emails allowed to sign in to
    this workspace."*
- Button label in `members-manager.tsx:93`: **"Invite" → "Add"**
  (mode-independent — "Invite" implies granting access, which is false
  in open mode where the row does nothing until restricted mode is on).
- Empty-state copy at `members-manager.tsx:103`: **"No one invited yet.
  Add an email above and share `/sign-in` with them." → "No entries
  yet."** — drop the mode-independent claim entirely rather than
  duplicating a conditional explanation in two places; the section
  subtitle above already carries the mode-specific explanation.
- Rejected alternative: hiding the section entirely in open mode. Kept
  visible instead, since AC-12 only requires the copy not to
  misrepresent behavior, not for the feature to disappear, and hiding
  would make it harder to pre-stage a restricted-mode allowlist.

`signupMode` is threaded as a single prop from one `getSignupMode()` call
in `settings/page.tsx` — no new data fetch, no schema change.

---

## 7. Risks flagged in AC doc Section 7 — resolved posture

### 7.1 Bot/rate-limit

The AC doc flags that no rate-limiting or CAPTCHA exists at the
app-level, no BotID/WAF is configured, but better-auth **has a built-in
rate limiter** already covering `/sign-in*`/`/sign-up*` at 3 req/10s per
IP**, active whenever `NODE_ENV === "production"` — true of this app's
Vercel deploys today.

**In scope for this feature (cheap, no new infra):** set
`rateLimit: { enabled: true }` explicitly in `setup.ts` rather than
relying on the implicit `isProduction` fallback — matches the codebase's
existing style of being explicit about production-sensitive behavior
(`setup.ts` already throws explicitly rather than silently falling back
for `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` on Vercel). Zero new
dependencies, one line.

**Explicit follow-up, not in scope here** (flagged per AC doc Section 7,
not silently dropped): the limiter's storage defaults to an in-process
`Map`, which does **not** share state across Vercel Fluid Compute
instances or cold starts — so the 3/10s rule is real but not a hard
global ceiling. A real fix needs either `secondaryStorage` (e.g. Vercel
KV/Upstash Redis — new infra + cost) or Vercel BotID (also a new
integration). Recommend scoping that as its own follow-up ticket once
real sign-up traffic is observed, rather than pre-emptively adding
paid infra for a feature that just went live.

**(Amendment 1: see §17 — the new `/request-password-reset` and
`/send-verification-email` endpoints get their own, stricter default rule
(3 req/60s), verified from source. No new work needed for that part.)**

### 7.2 Skipping email verification

`requireEmailVerification: false` is isolated to the single config key
in §3 — flipping it on later needs no redesign, just wiring
`emailVerification.sendVerificationEmail` to a mail provider (same
provider password-reset would need, §5 — worth bundling those two
follow-ups together when they're picked up).

**(Amendment 1: this follow-up has now happened — see §12/§15. Kept above
unedited as history.)**

### 7.3 GDPR/BDSG posture shift (5 invited users → public signup)

Per `gdpr-compliance`: moving to open public signup with no proof of
email ownership (§7.2) and no consent/privacy-notice surface changes the
lawful-basis and data-minimization picture materially for an app holding
broker statements and tax computations. Concretely, **this codebase has
no privacy-policy/Datenschutzerklärung page or route at all** today (I
grepped `src/app` — confirmed absent), which is a gap independent of
this feature but becomes much higher-stakes the moment sign-up is public
rather than personally-invited. Recommend, as an explicit follow-up (not
blocking these AC, consistent with the AC doc's own framing):
- A privacy-notice page + a link from the sign-up form (Art. 13 GDPR
  point-of-collection notice requirement).
- A `gdpr-compliance` skill pass shortly after this ships, specifically
  on: consent copy, data minimization for the new `account.password`
  column now actually being populated, and breach-notification posture
  now that the user base is unbounded rather than 5 known individuals.

**(Amendment 1: still open, still not closed by this amendment — see
§20/AC-29. Re-grepped `src/app` again for Amendment 1: still no
privacy-policy route. Gap carried forward, not fixed.)**

**(RESOLVED, post-Amendment-1 (2026-08-05): user confirmed this gap
should be closed with a real page, not just more documentation of the
gap. See new §26 — `src/app/privacy/page.tsx` now exists. It is a
first-draft, technically-grounded document, **not a legally reviewed
one** — flagged prominently in the page itself and restated in §26.)**

---

## 8. File-by-file plan

| File | Change |
|---|---|
| `src/lib/env.ts` | `AUTHORIZED_EMAILS` → optional; add `AUTH_SIGNUP_MODE` enum (default `"open"`) |
| `src/instrumentation.ts` **(new)** | `register()` hook, Node runtime only, side-effect `import "@/lib/env"` — makes the Zod parse actually run at boot; today `lib/env.ts` is imported nowhere in the app, so AC-9/AC-10's "when app boots (Zod parse in env.ts)" framing doesn't yet hold — this closes that gap as part of the same change |
| `src/lib/auth/signup-mode.ts` **(new)** | `getSignupMode(): "open" \| "restricted"` |
| `src/lib/auth/setup.ts` | add `emailAndPassword` block (§3); add `rateLimit: { enabled: true }` (§7.1); restructure `databaseHooks.user.create.before` to branch on `getSignupMode()` (§2) |
| `src/lib/db/schema.ts` | one-line doc-comment fix on `allowedEmails` (§2) — no column/table change |
| `src/app/sign-in/page.tsx` | Server Component; call `getEnabledAuthProviders()` + `getSignupMode()`; drop "invite-only" copy; render `AuthCard` |
| `src/components/auth/auth-card.tsx` **(new)** | OAuth buttons (provider-driven) + email/password sign-in/sign-up tabs + client validation + error-code mapping (§6.2) |
| `src/components/pulse/members-manager.tsx` | copy: "Invite" → "Add"; empty-state simplified (§6.3) |
| `src/app/(app)/settings/page.tsx` | thread `getSignupMode()` into the Members section subtitle (§6.3) |
| — | **No Drizzle migration.** `account.password`, `user.emailVerified`, `allowed_emails` already exist and are reused as-is. |

**(Amendment 1: see §21 for the additional files this amendment touches —
`setup.ts` gets a second, larger change on top of the one above;
`auth-card.tsx` above now also needs the Forgot-password affordance from
§16.2; two new pages are added.)**

---

## 9. Traceability

AC-1/AC-7 ← §2 (default-open hook); AC-2/AC-3 ← §3, §6.2; AC-4 ← §4;
AC-5/AC-6 ← better-auth default (no custom code, §1); AC-8 ← §2
(restricted branch, unchanged allowlist path); AC-9/AC-10 ← §2 env schema
+ `instrumentation.ts` (§8); AC-11 ← §6.1; AC-12 ← §6.3; AC-13 ← unchanged
(hook only fires on `user.create`, never on sign-in, in both modes — no
code path re-checks existing users).

**(Amendment 1: see §22 for AC-14…AC-29 traceability.)**

## 10. Items needing the user's (not architect-level) sign-off before a developer starts

1. **This change makes the live production deployment public the moment
   it ships, with no Vercel env change required**, because
   `AUTH_SIGNUP_MODE` defaults to `"open"`. That is literally the
   requested outcome (AC doc Section 2), but flipping a real financial-
   data app from 5 personally-invited users to open public signup is a
   one-way door on data-protection posture (§7.3) — confirm this is
   intended for *this* deployment before merging, not just for the
   feature in the abstract. If a staged rollout is preferred, set
   `AUTH_SIGNUP_MODE=restricted` on the current Vercel project at deploy
   time and flip it deliberately later.
   **RESOLVED (user sign-off, 2026-08-05): public-by-default in
   production is confirmed as intended for this deployment.**
2. **Whether the two follow-ups flagged as explicitly out of scope
   (password reset, email verification/CAPTCHA/BotID/secondaryStorage
   rate-limit backing) should be scheduled now or deferred** — this
   design keeps each as a single, cleanly isolated toggle/integration
   point so none of them require redesign later, but someone should
   decide the timeline, not silently let them lapse.
3. **No privacy-policy page exists in this codebase at all** (§7.3) —
   confirm whether shipping open public signup without one is acceptable
   short-term or should block launch; this is a legal/product call, not
   an architecture one.
   **RESOLVED (user sign-off, 2026-08-05): ship a real privacy-policy
   page rather than continue documenting the gap — see new §26.**

**(Amendment 1 supersedes item 2 above for password reset/email
verification specifically — both now in scope, see §16. Items 1 and 3 are
now resolved per the callouts above. See §22 for the amendment's own
sign-off list, which is additive to, not a replacement for, this one.)**

---
---

# Amendment 1 (2026-08-05): real email delivery, password reset, custom domain, data-lifecycle docs

**Input:** `docs/superpowers/specs/2026-08-05-open-signup-ac.md`, "Amendment 1"
section (AC-14…AC-29, Open Questions 6–11).
**Grounding:** re-verified against the package actually installed in this
repo — `better-auth@1.6.11` (confirmed via `node_modules/better-auth/package.json`;
`package.json`'s declared `^1.2.0` range is stale, matching the AC doc's own
note). I re-read every file:line citation from §1 above directly against the
1.6.11 source before relying on it further: **all of them still hold
verbatim** (`create-context.mjs:182-183`, `sign-up.mjs:160-205`,
`sign-in.mjs:208-227`, `rate-limiter/index.mjs:185-198` all match what's
quoted above, unchanged). One packaging-only change worth noting: the
`socialProviders` implementations (`google.mjs`, `github.mjs`) moved out of
`better-auth/dist/social-providers/` into a separate `@better-auth/core`
subpackage in this version
(`node_modules/.pnpm/@better-auth+core@1.6.11.../node_modules/@better-auth/core/dist/social-providers/`)
— a dependency-graph change, not a behavior change; nothing in the original
design depended on that path.

Pre-existing state confirmed before designing further (per the AC doc's own
grounding notes, independently re-confirmed by reading the files myself):
`src/lib/auth/setup.ts` is still exactly the pre-feature 80-line file (no
`emailAndPassword` block, no `AUTH_SIGNUP_MODE`, hard-throws the old
allowlist check unconditionally) — i.e. **none of §1–§10 above has been
implemented yet either.** `src/lib/email/resend.ts` and
`src/lib/auth/auth-emails.ts` exist, are unit-tested (structurally reviewed;
see the note in §22 on not having executed them myself), and are correct as
far as they go, but are dead code today — nothing imports `auth-emails.ts`
from `setup.ts`. `src/components/auth/auth-card.tsx` does not exist
(confirmed via `Glob`). `src/lib/db/schema.ts` already defines a
`verification` table (`id`, `identifier`, `value`, `expiresAt`, `createdAt`,
`updatedAt` — matches better-auth's default Drizzle adapter table exactly;
see §14).

---

## 11. OQ-6 (AC-14/AC-15) — does unverified email block credential sign-in?

**Decision: nudge-only (option (a)). `requireEmailVerification` stays
`false`; verification email sending is driven by a separate,
independent config key.**

This needed source-verification because better-auth's `requireEmailVerification`
flag does **two** separate things, not one, and the interaction matters:

1. **Sign-in blocking** (`dist/api/routes/sign-in.mjs:229-241`): if
   `requireEmailVerification: true` and `!user.emailVerified`, the sign-in
   handler **unconditionally throws `FORBIDDEN`/`EMAIL_NOT_VERIFIED`**
   (optionally re-sending the verification email first if
   `emailVerification.sendOnSignIn` is set) — there is no built-in
   "nudge-only" mode gated by this flag; setting it `true` always means
   block-until-verified.
2. **Sign-up side effect** (`dist/api/routes/sign-up.mjs:160-161`):
   `shouldReturnGenericDuplicateResponse = requireEmailVerification ||
   autoSignIn === false`, and `shouldSkipAutoSignIn = autoSignIn === false ||
   shouldReturnGenericDuplicateResponse`. Critically, `shouldSkipAutoSignIn`
   is checked for **every** sign-up, not just duplicates (`sign-up.mjs:249`):
   `if (shouldSkipAutoSignIn) return ctx.json({ token: null, user })`. So
   setting `requireEmailVerification: true` would **also** silently disable
   auto-sign-in for brand-new, first-time sign-ups — directly breaking
   AC-2's "signed in and redirected to `/`, no check-your-inbox
   interstitial" for every legitimate new user, not just the AC-15 case
   it's nominally about. It would **also** silently flip §4's already-made
   decision on AC-4 (duplicate sign-up would switch from a revealing 422 to
   a non-revealing synthetic-success response) as an unplanned side effect
   of an AC-15 decision.

Sending the verification email (AC-14) does **not** require
`requireEmailVerification: true` — it's independently controlled by
`emailVerification.sendOnSignUp` (`dist/api/routes/sign-up.mjs:239`:
`ctx.context.options.emailVerification?.sendOnSignUp ??
ctx.context.options.emailAndPassword.requireEmailVerification`). Setting
`sendOnSignUp: true` explicitly with `requireEmailVerification` left `false`
gets AC-14 (unconditional sending) with **zero** side effects on
auto-sign-in or on §4's enumeration decision — a strictly additive change.

This is why nudge-only is the recommendation: it satisfies AC-14 (send
always), keeps AC-2's zero-friction sign-in intact exactly as originally
designed, and doesn't reopen §4's already-settled trade-off. Block-until-
verified (option (b)) is not wrong per AC-15's "either resolution
acceptable" wording, but it is a materially bigger change than it looks —
it also changes sign-up's auto-sign-in behavior and AC-4's enumeration
posture as coupled side effects, which would need to be re-confirmed with
business-analyst/`nextjs-security`, not silently absorbed into an AC-15
decision. Flagging this coupling is itself the useful finding here, even
though nudge-only is my recommendation.

**UI implication:** sign-in and sign-up continue to succeed with a session
immediately (unchanged from §3/§6). The UI should show a persistent, low-key
"please verify your email" indicator (banner or account-menu badge) for
`session.user.emailVerified === false`, with a "resend verification email"
action (`authClient.sendVerificationEmail({ email, callbackURL })`) —
this satisfies AC-15's requirement that whichever behavior is chosen, "the
sign-in UI's copy must accurately reflect it" (a nudge, not a block).

---

## 12. OQ-7 (AC-19) — are other sessions revoked on password reset?

**Verified: no, not by default.** `dist/api/routes/password.mjs:164`:

```js
if (ctx.context.options.emailAndPassword?.revokeSessionsOnPasswordReset)
  await ctx.context.internalAdapter.deleteSessions(userId);
```

This is a plain truthy check on an optional config key with no default —
better-auth does **not** auto-revoke other sessions on password reset unless
this is explicitly turned on.

**Decision: set `revokeSessionsOnPasswordReset: true` explicitly.** A
password reset is frequently triggered by suspected compromise (that's the
whole point of the flow); leaving old sessions alive after a reset defeats
much of the security value of resetting in the first place. This is a
one-line addition to the `emailAndPassword` block (§15) with no other
moving parts — no custom revocation code needed, better-auth's own
`internalAdapter.deleteSessions(userId)` handles it.

---

## 13. OQ-8 (AC-20) — token TTL and one-time-use mechanics (verified, and an asymmetry worth flagging)

Verified directly from source, and these two token kinds are **not**
implemented the same way — this asymmetry matters for §19/§20:

**Password-reset tokens** (`dist/api/routes/password.mjs`):
- Stored as a real DB row in the `verification` table:
  `identifier: "reset-password:${token}"`, `value: userId`, `expiresAt`
  (line 66-70).
- Default TTL: `ctx.context.options.emailAndPassword.resetPasswordTokenExpiresIn
  || 3600` seconds = **1 hour** (line 64), configurable via
  `resetPasswordTokenExpiresIn`.
- **True one-time-use**: on successful reset, the verification row is
  deleted (`deleteVerificationByIdentifier(id)`, line 159) — a second
  attempt with the same token then fails the `findVerificationValue`/
  expiry check (line 149) and throws `INVALID_TOKEN`, with **no** side
  effect (matches AC-20's literal wording exactly).

**Email-verification tokens** (`dist/api/routes/email-verification.mjs`):
- **Not stored in the database at all.** `createEmailVerificationToken`
  (line 12-18) is a **stateless, signed JWT** (`signJWT(payload, secret,
  expiresIn)`), verified later purely via `jwtVerify` against
  `BETTER_AUTH_SECRET` (`email-verification.mjs:161`) — no
  `verification` table row is ever created for this flow.
- Default TTL: `expiresIn = 3600` (line 12 default parameter) = **1 hour**,
  configurable via `emailVerification.expiresIn`.
- **Re-use is idempotent-success, not an error**: if the token is still
  cryptographically valid (not expired) but the account is already
  verified, the handler returns `{ status: true, user: null }` — a success
  response, not a rejection (line 258-264). Only an actually-expired JWT
  (`JWTExpired` → `TOKEN_EXPIRED`) or a malformed/tampered one
  (`INVALID_TOKEN`) produces an error. So AC-20's "action rejected... link
  expired or already used" framing is accurate for the *expired* case but
  not literally accurate for the *already-used-but-still-fresh* case —
  clicking the same valid verification link twice within the hour succeeds
  silently both times rather than erroring on the second click. No harmful
  side effect occurs either way (nothing changes on the second click), so
  this satisfies AC-20's substance ("no side effect occurs") even though
  the literal "rejected with an error" framing doesn't apply to this one
  sub-case. Recommend the UI treat `{status:true, user:null}` as an
  "already verified" success state ("Your email is already verified") to
  keep the user-facing copy honest about what actually happened, rather
  than always showing a generic "verified!" message.

Neither TTL needs to be changed from better-auth's default — both are
already a sensible 1 hour, consistent with the treatment `minPasswordLength`
got in §3 (state the default explicitly in config so it's visible and
doesn't silently drift on a future upgrade).

---

## 14. Verified: `emailAndPassword`/`emailVerification` config surface, and OAuth interaction (AC-16)

Final `src/lib/auth/setup.ts` config (replaces §3's block):

```ts
import { sendVerificationEmail, sendResetPasswordEmail } from "./auth-emails";

// ...

emailAndPassword: {
  enabled: true,
  requireEmailVerification: false, // nudge-only — see §11
  minPasswordLength: 8,
  maxPasswordLength: 128,
  autoSignIn: true, // unchanged from §3/§4 — do not flip
  revokeSessionsOnPasswordReset: true, // §12
  resetPasswordTokenExpiresIn: 3600, // == better-auth default; explicit for clarity, per §3's precedent
  sendResetPassword: async ({ user, url }) => {
    await sendResetPasswordEmail({ user, url });
  },
},
emailVerification: {
  sendOnSignUp: true, // AC-14 — unconditional, independent of requireEmailVerification, see §11
  expiresIn: 3600, // == better-auth default; explicit for clarity
  sendVerificationEmail: async ({ user, url }) => {
    await sendVerificationEmail({ user, url });
  },
},
```

`auth-emails.ts`'s existing function signatures
(`sendVerificationEmail({ user, url })`, `sendResetPasswordEmail({ user, url })`)
match better-auth's callback shape (`{ user, url, token }`, callback ignores
the extra `token` field) with no changes needed to that file — confirms the
interrupted developer pass built the right shape even though it wasn't wired
up yet.

**AC-16 verified nuance (OAuth sign-ups and `emailVerified`):** AC-16 states
"no verification email is sent [to OAuth sign-ups] ... OAuth providers
already assert email ownership." This is **true in the overwhelming common
case but not unconditionally guaranteed by better-auth**, and I want to
flag the exact mechanism rather than assert the AC's blanket claim:
- Google: `emailVerified: user.email_verified`
  (`@better-auth/core/dist/social-providers/google.mjs:92`) — Google's own
  OIDC claim, true for essentially all consumer accounts, but not
  contractually guaranteed for every Workspace/enterprise configuration.
- GitHub: `emailVerified = emails?.find(e => e.email === profile.email)?.verified ?? false`
  (`.../social-providers/github.mjs:74`) — a real per-email lookup against
  GitHub's API, not hardcoded to `true`.
- With `emailVerification.sendOnSignUp: true` configured (required for
  AC-14/§11), `dist/oauth2/link-account.mjs:97` **will** send a
  verification email to a brand-new OAuth sign-up if the provider itself
  reports `emailVerified: false` for that account:
  `if (!userInfo.emailVerified && user && ...sendOnSignUp && ...sendVerificationEmail)`.

In practice this only fires for the rare OAuth account whose provider
itself doesn't vouch for the email — treating that case the same as a
password sign-up (send a verification email) is arguably *more* correct
than blanket-trusting an unverified-per-provider address, not a bug. I'm
not proposing a workaround (e.g. force-setting `emailVerified: true` in a
hook regardless of the provider's claim, which would override a legitimate
signal from the provider and weaken the actual guarantee AC-16 is trying to
preserve). Flagging this as a documented, narrow, intentional deviation
from AC-16's literal "no verification email is ever sent for OAuth"
wording — needs a nod from business-analyst/`code-reviewer` that this edge
case is acceptable as-is rather than something to special-case away.

---

## 15. Rate limiting for the new endpoints (verified — no new work needed)

`dist/context/create-context.mjs:185-198`'s `getDefaultSpecialRules()`
already special-cases the new endpoints this amendment adds, on top of the
`/sign-in*`/`/sign-up*` rule from §7.1/§1:

```js
{
  pathMatcher: (path) => path === "/request-password-reset"
    || path === "/send-verification-email"
    || path.startsWith("/forget-password")
    || path === "/email-otp/send-verification-otp"
    || path === "/email-otp/request-password-reset",
  window: 60,
  max: 3,
}
```

3 requests per 60 seconds per IP for both the forgot-password request and
the resend-verification-email endpoint — stricter than the general
sign-in/sign-up rule, and exactly the right shape to blunt email-bombing
abuse of the newly-real outbound mail (a concrete, previously-hypothetical
risk that becomes real the moment Resend is wired up). This is covered by
the same `rateLimit: { enabled: true }` line already recommended in §7.1 —
**no additional config or code needed** for this. The in-memory,
not-shared-across-instances caveat from §7.1 applies equally here and is
not re-litigated.

---

## 16. UI: forgot-password / reset-password flow (AC-17, AC-18)

### 16.1 What needs a page vs. what doesn't

Verified from `dist/api/routes/password.mjs` and `email-verification.mjs`:
- **Email verification** (`/verify-email` — AC-14/AC-16): the link in the
  email points directly at better-auth's own API route
  (`{baseURL}/api/auth/verify-email?token=...&callbackURL=...`). That
  handler validates the token, flips `emailVerified`, and itself issues an
  HTTP redirect to `callbackURL` (`email-verification.mjs:259-263`,
  `:288`). **No new app page is needed for verification** — set
  `callbackURL` to `/` (or a small "email verified!" toast route) when
  calling `sendVerificationEmail`/on the client's initial sign-up call.
- **Password reset** (AC-17/AC-18) is a **two-hop** flow and *does* need one
  new app-owned page:
  1. `POST /api/auth/request-password-reset` (client:
     `authClient.requestPasswordReset({ email, redirectTo: "/reset-password" })`
     — exact auto-derived client method name should be confirmed via
     TypeScript autocomplete at implementation time, since better-auth's
     client infers it from the server's route map rather than a hardcoded
     string I can verify without running the generated types) sends the
     email with a link to better-auth's own
     `GET /api/auth/reset-password/:token?callbackURL=/reset-password`.
  2. That better-auth route (`requestPasswordResetCallback`,
     `password.mjs:83-119`) validates the token still exists and hasn't
     expired, then redirects the browser to
     `/reset-password?token=<token>` — **our** app's page. Confirmed this
     app does not have this page yet (only `auth-card.tsx`/pages listed in
     §21 are new).

### 16.2 New page: `src/app/reset-password/page.tsx`

- Client Component. Reads `token` from the search params.
- Renders a single "choose a new password" form (same 8-char client
  pre-check as §6.2/AC-3), submits via
  `authClient.resetPassword({ newPassword, token })`.
- On success: "Password updated — old password no longer works" per AC-18,
  then link/redirect to `/sign-in`.
- On `INVALID_TOKEN`: "This link has expired or already been used — request
  a new one," with a link back to the forgot-password entry point (AC-20).
- No `token` in the URL at all (e.g. user navigated here directly): show
  the same "request a new one" state rather than a confusing empty form.

### 16.3 `auth-card.tsx` addition: "Forgot password?" link (§6.2, supersedes §5's "omit it entirely")

- Visible only on the **Sign in** tab (not Create account).
- Opens a small inline form (email only) that calls
  `authClient.requestPasswordReset({ email, redirectTo: "/reset-password" })`.
- Per AC-17's anti-enumeration requirement, the response copy is identical
  regardless of whether the email has an account — better-auth's own route
  already returns the same `{ status: true, message: "If this email exists
  in our system, check your email for the reset link" }` shape whether or
  not the user exists (`password.mjs:59-63` vs. `:78-81`), so the UI simply
  displays that message verbatim — no client-side branching needed, this is
  free from the existing endpoint shape.

---

## 17. Custom domain migration: `ptfolio.net` (AC-21…AC-24)

### 17.1 Apex vs. subdomain (OQ-9 — needs the user's sign-off, not just mine)

**My recommendation: apex (`ptfolio.net`), matching the AC doc's own
suggestion.** Reasoning: this is a single-product app with no separate
marketing/landing surface today (the sign-in page at `/` already *is* the
marketing page — see `src/app/sign-in/page.tsx`'s hero copy). A subdomain
(`app.ptfolio.net`) only earns its keep once there's a distinct marketing
site that wants the apex for itself; introducing that split pre-emptively
adds a second DNS record and a second `trustedOrigins` entry for no present
benefit. If a marketing site is ever built, moving the app from apex to
`app.` subdomain later is the same category of migration as this one (same
mechanics as §17.2), so nothing is foreclosed by choosing apex now.
**This stays a "needs the user's direct confirmation" item (§22), not
something I'm treating as settled** — apex has a real, if minor, downside
(no room for a separate marketing site at the same domain without a further
migration later) that's a product call, not an architecture one.

**RESOLVED (user sign-off, 2026-08-05): apex domain `ptfolio.net`
confirmed (not a subdomain).**

### 17.2 Config change (AC-22 — confirmed config-only for the base-URL switch itself)

`getBaseUrl()`/`getTrustedOrigins()` in `setup.ts` need **no code change**
for the steady-state switch: setting `BETTER_AUTH_URL=https://ptfolio.net`
(Production **and** Preview environments in Vercel) is sufficient —
`getBaseUrl()` already reads this env var first, and `getTrustedOrigins()`
already derives from it. This confirms AC-22's premise exactly.

**One small, genuinely new piece of code is needed for the transition
window itself (AC-24) — see §17.4.** This is a scope clarification worth
being explicit about: AC-22's "config change only" is true for the
permanent end-state, but not quite true for the temporary cutover period,
where I'm recommending one new optional env var and a two-line change to
`getTrustedOrigins()`.

### 17.3 DNS / Vercel steps (AC-23 — user's own action, not a developer task)

Adding `ptfolio.net` to the Vercel project and creating whatever DNS
records Vercel's own domain-connection flow specifies at Squarespace is
manual, external-system work analogous to the Resend domain verification
already completed for `mail.ptfolio.net` — **not something achievable via
this repo's code or CLI**, and not a developer-agent task. Flagging this
explicitly rather than guessing at record types/values I have no way to
verify without the user's own Vercel dashboard session.

Also worth flagging while on this topic: `.github/workflows/quotes-refresh.yml`
(the GitHub Actions cron that hits `/api/cron/quotes` hourly) reads a
repo-level Actions **variable** `VERCEL_PRODUCTION_URL`, currently presumably
set to the `*.vercel.app` URL. This needs updating to the new domain as part
of the cutover too, or it keeps working against the old URL indefinitely
(harmless if §17.4's "keep the old URL alive" recommendation is followed,
but worth doing deliberately rather than leaving stale) — a small,
easily-missed loose end from AC-21's "same routes, same auth flows" scope
that isn't really about auth at all, flagging it here since it's the same
domain-migration event.

### 17.4 Old `*.vercel.app` URL behavior + in-flight tokens (AC-24 — OQ-10)

**Recommendation: option (a), the old URL continues to work in parallel
indefinitely.** This is actually Vercel's own default behavior when a
custom domain is added — the originally-assigned `*.vercel.app` production
alias is not automatically disabled or redirected unless explicitly
configured to be. So "keep it alive" costs nothing extra; it's redirecting
or disabling it (options (b)/(c)) that would require deliberate extra
configuration. I'm recommending the zero-effort default here, not
proposing new work — this can be revisited later (e.g. for SEO/security
reasons) as its own low-risk, reversible follow-up decision, unlike §17.1
which is a one-way-ish product call.

**RESOLVED (user sign-off, 2026-08-05): keep the old `*.vercel.app` URL
running indefinitely — no redirect, no disable.**

**The in-flight-token interaction (why this needs more than "do nothing"):**
verified from `dist/api/middlewares/origin-check.mjs`. The globally-applied
`originCheckMiddleware` (mounted on `/**`, `dist/api/index.mjs:156-159`)
validates the request's `Origin`/`Referer` header against `trustedOrigins`
for any state-changing (non-GET/HEAD/OPTIONS) request that carries a
`cookie` header (`origin-check.mjs:94-102`, the `useCookies` check). A
password-reset link emailed **before** the domain cutover has the old
`*.vercel.app` base URL baked into it (better-auth builds these links from
`ctx.context.baseURL` at send-time, not dynamically at click-time —
`password.mjs:72`, `email-verification.mjs:29`). If a visitor clicks that
old link **after** `BETTER_AUTH_URL` has already been flipped to
`ptfolio.net`:
1. The `GET` request lands on the old `*.vercel.app` host (still live, per
   the "keep it running" default above) — this part works fine regardless
   of `trustedOrigins`, since GET/redirect requests skip the origin check
   entirely (`origin-check.mjs:40`).
2. The reset-password page then renders at the **old** domain and its
   final `POST /api/auth/reset-password` submission carries the old
   domain as `Origin`. If the browser has *any* cookie set for that origin
   at that point, this POST **will** be checked against `trustedOrigins` —
   and would be rejected with `INVALID_ORIGIN` if only the new domain is
   listed.

**Concrete fix:** add a small, explicitly temporary allowance to
`getTrustedOrigins()`:

```ts
function getTrustedOrigins(): string[] {
  const legacy = process.env.BETTER_AUTH_LEGACY_ORIGIN; // e.g. the old *.vercel.app URL, unset once the transition window has passed
  return [
    getBaseUrl(),
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
    legacy,
  ].filter(Boolean) as string[];
}
```

Set `BETTER_AUTH_LEGACY_ORIGIN` to the old `*.vercel.app` production URL for
a generous window after cutover (recommend at least 24 hours — comfortably
longer than the 1-hour token TTLs from §13, with margin for DNS propagation
delays before `ptfolio.net` is reliably resolving for every visitor), then
remove the env var. This is the one piece of "AC-22 is config-only, except
for this" code mentioned in §17.2 — a two-line, reversible addition, not a
redesign, and it directly closes the gap AC-24 explicitly flags ("links
must not silently break as an unplanned side effect of migration"). Note
this is orthogonal to the "keep the old URL alive indefinitely" decision
just above: this allowance is about the cutover window only, not about how
long the old URL keeps serving traffic afterward.

---

## 18. OQ-11 (AC-28) — data-erasure cleanup for tokens and abandoned sign-ups

Verified in `dist/db/internal-adapter.mjs`: better-auth's own internal
adapter **never sweeps expired rows on its own** — it is a library called
per-request, not a background process. Concretely:
- `createVerificationValue` (line 571) inserts a row with an `expiresAt`.
- `deleteVerificationByIdentifier` (line 630) is only ever called from the
  `resetPassword` route **on successful use** (`password.mjs:159`) — a
  reset request that's issued and never clicked (or clicked after
  expiring) leaves its `verification` row in the table forever.
- Confirmed against `src/lib/auth/cron.ts` directly (also independently
  confirmed by business-analyst's grounding note): it contains only the
  `hasValidCronSecret` bearer-token check, used by the `quotes`/`fx`/
  `coinbase` sync routes — **no auth-data cleanup exists today.**

So the answer to OQ-11 is: **yes, a new cleanup task is needed if we want
these rows reaped at all; better-auth does not do it for us.** But the
scope of what needs cleaning is narrower and lopsided in an important way,
because of §13's asymmetry:

- **Password-reset `verification` rows**: real, accumulating, unbounded
  DB rows for every forgot-password request that's never completed. This
  is the one concrete thing a new cron task should clean up:
  `DELETE FROM verification WHERE expires_at < now()`. Cheap, generic (also
  incidentally cleans up any other plugin's use of the same `verification`
  table in the future), and safe (rows are only ever read by identifier
  match plus an explicit expiry check, so deleting already-expired rows
  changes no observable behavior).
- **Email-verification tokens**: per §13, these are stateless JWTs that
  never touch the database at all — **there is nothing to clean up in the
  DB for this flow.** Any "abandoned unverified sign-up" cleanup is really
  about the `user`/`account` rows themselves (below), not tokens.
- **Abandoned (never-verified) sign-ups**: this is a **materially bigger,
  separate decision** than token cleanup, and I'm not resolving it here —
  it means deciding whether to **delete user accounts** (the `user` row,
  its `account` row, and potentially other owned data) after some
  retention window if `emailVerified` never flips to `true`. Better-auth
  has no opinion on this at all (it doesn't touch the `user` table for
  this reason ever). This is a genuine open product/GDPR question — does
  data-minimization (`gdpr-compliance`, §7.3/§20) favor auto-deleting
  never-verified accounts after e.g. 30 days, or does the low volume of a
  still-small user base make this not worth building yet? Flagging as a
  **new open decision needing sign-off** (§22), separate from and larger
  than the straightforward token-cleanup piece above.

**RESOLVED (user sign-off, 2026-08-05): auto-delete never-verified
accounts after 6 months of account age, subject to a mandatory
owned-data safeguard. See new §23 for the precise, implementation-ready
design (exact predicate, dry-run rollout, audit trail).**

**Implementation shape for the (narrower, decided) token-cleanup task**,
following this repo's existing convention (`src/app/api/cron/{quotes,fx,coinbase}/route.ts`,
all `hasValidCronSecret`-gated `GET` handlers triggered by a scheduled
GitHub Actions workflow — see `.github/workflows/quotes-refresh.yml` — since
this repo has no `vercel.json` and doesn't use Vercel's native cron feature
anywhere today):

- New `src/app/api/cron/auth-cleanup/route.ts`, same
  `hasValidCronSecret` guard, `DELETE FROM verification WHERE expires_at <
  now()` via the existing Drizzle `getDb()`.
- New scheduled GitHub Actions workflow (daily is plenty — these rows are
  harmless clutter, not a security exposure, while they wait), mirroring
  `quotes-refresh.yml`'s pattern (reusing the same `CRON_SECRET` repo
  secret and `VERCEL_PRODUCTION_URL` repo variable already configured for
  the existing crons — see §17.3's note that this variable needs updating
  post-domain-cutover regardless).

**(§23 extends this same route with a second sweep — not a new
mechanism, not a new cron/workflow.)**

---

## 19. Data-processes / data-lifecycle documentation (AC-25…AC-29)

Per `documentation-standards`'s "one concept per file" discipline — sign-up
*behavior* (this doc) and a *data-governance/GDPR inventory* are different
concepts, and the AC doc's own Section 9 explicitly asks for this as its
own doc rather than folded in here — I'm writing this as a **separate
document**: `docs/superpowers/specs/2026-08-05-open-signup-data-lifecycle.md`.

That document is design-stage (like this one) — `documentation-writer`'s
job, once the feature ships, is to fold its content into a durable doc
under `docs/` proper and add the `docs/INDEX.md` entry per the AC doc's own
Section 9 instructions (not something I'm doing here, since it doesn't
reflect shipped behavior yet). I'm delivering the content now because it
depends on the exact verified schema/table facts from this design pass
(§13/§18), which the `developer` and later `documentation-writer` should
build from directly rather than re-deriving.

See that document for: the full process inventory (AC-25), the
table/column data inventory including the `verification` table's exact
verified shape and the split between DB-backed and stateless-JWT tokens
(AC-26), Resend as a named subprocessor (AC-27), the erasure/retention
analysis building on §18 (AC-28), and the carried-forward privacy-policy
gap (AC-29, unchanged from §7.3).

**(That companion doc's own summary list is now resolved in step with
§22/§23/§24 below — see the companion doc's updated AC-28/AC-26/Summary
sections.)**

---

## 20. Updated file-by-file plan (Amendment 1 additions, on top of §8)

| File | Change |
|---|---|
| `src/lib/auth/setup.ts` | (on top of §8's changes) add `emailVerification` block and extend `emailAndPassword` with `sendResetPassword`, `revokeSessionsOnPasswordReset`, `resetPasswordTokenExpiresIn` (§14); import `sendVerificationEmail`/`sendResetPasswordEmail` from `./auth-emails`; add legacy-origin allowance to `getTrustedOrigins()` (§17.4, temporary); add `databaseHooks.account.create.before` token-nulling hook (§24) |
| `src/components/auth/auth-card.tsx` **(new — not yet built at all)** | everything in §6.2, plus: "Forgot password?" link + inline request form (§16.3); unverified-email nudge banner (§11) |
| `src/app/reset-password/page.tsx` **(new)** | new-password form, reads `token` from search params, calls `authClient.resetPassword` (§16.2) |
| `src/app/api/cron/auth-cleanup/route.ts` **(new)** | `verification` table expiry sweep (§18) **and** abandoned-account sweep (§23) — one route, two sweeps |
| `.github/workflows/auth-cleanup.yml` **(new)** | daily trigger for the above, mirroring `quotes-refresh.yml` (§18) |
| `.github/workflows/quotes-refresh.yml` | update `VERCEL_PRODUCTION_URL` repo variable post-domain-cutover (§17.3) — config/ops change, not a code diff |
| Vercel project settings + Squarespace DNS | add `ptfolio.net` custom domain; set `BETTER_AUTH_URL`, temporary `BETTER_AUTH_LEGACY_ORIGIN` (§17.2/§17.4) — **user's own action, not a developer-agent task** |
| `docs/superpowers/specs/2026-08-05-open-signup-data-lifecycle.md` **(new)** | AC-25…AC-29 deliverable (§19) |
| `src/lib/env.ts` | add `AUTH_CLEANUP_DELETE_ENABLED` enum, default `"false"` (§23.4) |
| `src/app/privacy/page.tsx` **(new — already written this session)** | real privacy-policy content (§26) |
| — | **No Drizzle migration.** The `verification` table already exists with the exact shape better-auth expects; no schema change for any of Amendment 1 (§23/§24/§26 also add no migration — see each section). |

---

## 21. Traceability (AC-14…AC-29)

AC-14 ← §14 (`emailVerification.sendOnSignUp: true`); AC-15 ← §11
(nudge-only); AC-16 ← §14's verified nuance; AC-17/AC-18 ← §16; AC-19 ← §12
(`revokeSessionsOnPasswordReset: true`); AC-20 ← §13 (TTL/one-time-use,
including the flagged asymmetry); AC-21/AC-22 ← §17.2; AC-23 ← §17.3;
AC-24 ← §17.4; AC-25…AC-28 ← the companion data-lifecycle doc (§19),
building on §13/§18's verified facts, now further resolved by §23/§24
below; AC-29 ← §7.3/§26 (real page now shipped, first-draft caveat noted).

---

## 22. Items needing the user's direct sign-off (Amendment 1 — additive to §10)

1. **Apex vs. subdomain (§17.1 / OQ-9).** I've made a recommendation
   (apex), but this is explicitly flagged in the AC doc as needing the
   user's own confirmation, not just an architect's judgment call.
   **RESOLVED: apex `ptfolio.net` confirmed.**
2. **Old `*.vercel.app` URL fate (§17.4 / OQ-10).** I've recommended
   "leave it running indefinitely" as the zero-cost default, with a
   temporary `trustedOrigins` allowance for in-flight tokens — confirm
   this is acceptable, or state a preference for redirecting/disabling it
   later (a separate, lower-risk decision that doesn't block this launch).
   **RESOLVED: keep running indefinitely — no redirect/disable.**
3. **Abandoned (never-verified) account retention (§18, new — not in the
   original AC doc's open-question list, surfaced by this design pass).**
   Should never-verified accounts be auto-deleted after some retention
   window? Better-auth has no default behavior here at all; this is a
   product/GDPR-minimization call, not something I'm resolving
   unilaterally. Until decided, these accounts simply persist indefinitely
   with `emailVerified: false`.
   **RESOLVED: delete after 6 months of account age (never-verified
   accounts only), gated by a mandatory owned-data safeguard — see new
   §23 for the exact, implementation-ready design.**
4. **Privacy-policy gap (§7.3/AC-29, unchanged from §10 item 3, restated
   here since Amendment 1's real email + custom domain work make the
   underlying app more externally visible, not because anything about the
   gap itself has changed).**
   **RESOLVED: a real privacy-policy page has been drafted and shipped as
   `src/app/privacy/page.tsx` — see new §26. Important: this is a
   first-draft, technically-grounded document, not a legally reviewed
   one — flag for lawyer/user review before treating it as binding
   compliance, especially now that this app targets an unbounded public
   German user base under GDPR/BDSG.**
5. **Whether the new `auth-cleanup` cron (§18) should ship in the same PR
   as the rest of Amendment 1 or as its own fast-follow** — it's a fully
   independent, low-risk piece of work (a `DELETE ... WHERE expires_at <
   now()` sweep) with no dependency on anything else in this amendment;
   flagging the sequencing choice rather than assuming it must be bundled.
   **RESOLVED: ships in the same PR as the rest of Amendment 1.**

**Note on verification method:** I do not have a shell/test-runner tool
available in this session, so I read (rather than executed)
`tests/lib/email/resend.test.ts` and `tests/auth/auth-emails.test.ts` — both
are structurally sound (mock `sendEmail`, assert recipient/subject/body
content, assert failure propagation) and should pass, but I have not
personally confirmed a green run. Per the task's own instruction to say so
rather than assume: `developer`/`tester` should run
`pnpm vitest run tests/lib/email tests/auth/auth-emails.test.ts` before
building on top of these files.

**Still open, not resolved by this round of sign-off (carried forward,
not silently dropped):** confirming Resend's actual processing region and
DPA terms directly against Resend's own dashboard (data-lifecycle doc's
Summary item 2) — this was not part of the decisions given in this round
and needs its own follow-up, ideally by whoever has access to the Resend
account, before the privacy-policy page's "Region" placeholder (§26) can
be de-flagged.

---

## 23. Precise design: 6-month abandoned (never-verified) account deletion sweep

**Status:** the user has confirmed (§22 item 3) the abandoned-account
retention decision: delete never-verified accounts after 6 months. This
section makes that decision mechanically precise, extending §18's
`auth-cleanup` cron (not a new mechanism), per the safeguard §18 itself
flagged as mandatory and the data-lifecycle doc's AC-28 §3 finding.

### 23.1 Scope clarification — confirming the reading

"6 months inactive" in the user's decision is read here as: **account age
since `user.createdAt` exceeds 6 months, and `emailVerified` has never
flipped to `true`** — i.e. a sign-up that was never completed, not a
previously-verified user who has since stopped logging in. This matches
the original open question's own framing (§18/§22 item 3: "abandoned
(never-verified) account retention") and is the narrower, safer reading.

I want to flag explicitly that a broader reading — deleting *verified*
users who simply go dormant (stop logging in) after some period — would be
a **materially different and much riskier policy**: it would require
tracking last-login/last-session activity (not currently a queryable
"last active" column on `user` — `session.expiresAt`/`createdAt` would
need to be consulted instead), and a verified user's *entire tax history*
could be live under that account, unlike a never-verified stub. That is
not what "abandoned (never-verified) account retention" meant in the
original open question, and I am implementing the narrower reading below.
If the user actually intends the broader policy as well, that needs to
come back as its own explicit decision — nothing below builds toward it.

Practical corollary from §14 (verified during this amendment): almost no
OAuth sign-up will ever match `emailVerified = false` for six months,
since Google/GitHub set `emailVerified` from the provider's own claim at
sign-up time (true in the overwhelming majority of cases). So in practice
this sweep almost exclusively targets **abandoned credential
(email+password) sign-ups** who never clicked the verification email —
consistent with the "abandoned sign-up" framing.

### 23.2 The mandatory safeguard: owner-scoped tables enumerated

Per §18's own flagged risk (and the data-lifecycle doc's AC-28 §3
finding, since `requireEmailVerification: false` means an unverified user
can fully use the app — import statements, connect crypto accounts,
generate tax reports — indefinitely before ever verifying), **this sweep
must never delete a user who has any real owned data**, regardless of
`emailVerified`/age.

I read `src/lib/db/schema.ts` in full (517 lines) and enumerated every
table with an owner-scoped foreign key to `user.id`. Complete list, all
verified to carry `onDelete: "cascade"` on the owner column (verified
line-by-line against the file, not from memory):

| Table | Owner column | `schema.ts` line |
|---|---|---|
| `broker_accounts` | `owner_user_id` | 105-107 |
| `imports` | `owner_user_id` | 128-130 |
| `instruments` | `owner_user_id` | 153-155 |
| `transactions` | `owner_user_id` | 175-177 |
| `positions` | `owner_user_id` (part of composite PK) | 227-229 |
| `tax_reports` | `owner_user_id` | 262-264 |
| `tax_report_lines` | `owner_user_id` | 279-281 |
| `lots` | `owner_user_id` | 299 |
| `realized_matches` | `owner_user_id` | 317 |
| `user_settings` | `owner_user_id` (primary key itself) | 352 |
| `crypto_accounts` | `owner_user_id` | 381 |
| `crypto_wallets` | `owner_user_id` | 416 |
| `crypto_daily_values` | `owner_user_id` | 442 |

Also present in the schema but **deliberately not** part of the safeguard
set, for a documented reason each:
- `session.user_id`, `account.user_id` (both `onDelete: "cascade"`) —
  these are auth-mechanism rows the deletion is *supposed* to remove, not
  "owned data" in the product sense; they cascade automatically once
  `user` is deleted, with no separate `DELETE` statement needed.
- `allowed_emails.added_by_user_id` (`onDelete: "set null"`) — an
  admin-authorship pointer, not the candidate's own data; irrelevant to
  whether the *candidate* has real data (matters only if the candidate
  happens to be an admin who's added allowlist entries — an extremely
  unlikely edge case for a never-verified, 6-month-old open-signup
  account; admins are the ~5 originally-invited users).
- `transactions.reviewed_by_user_id` (`onDelete: "set null"`) — same
  reasoning; being the *reviewer* of someone else's transaction row is
  not "owned data" for the candidate, and is set-null-safe regardless.
- `instrument_meta`, `fx_rates`, `quote_cache`, `quote_history` — global,
  user-independent market data; no `ownerUserId`-shaped column at all.

This is a **living list, not a one-time enumeration** — if any future
table adds an `ownerUserId`-shaped FK to `user.id`, it must be added here
before the sweep can be considered safe. Recommend a one-line comment near
the top of `schema.ts` cross-referencing this section, so the next person
adding an owner-scoped table sees it; `code-reviewer` should check any
future schema PR against this list.

### 23.3 Exact query shape

Reusing §18's already-planned `src/app/api/cron/auth-cleanup/route.ts`
(extends it with a second sweep, not a new file/mechanism):

```ts
import { and, eq, inArray, lt, notExists, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  user,
  brokerAccounts, imports, instruments, transactions, positions,
  taxReports, taxReportLines, lots, realizedMatches, userSettings,
  cryptoAccounts, cryptoWallets, cryptoDailyValues,
} from "@/lib/db/schema";

const db = getDb();

// An "abandoned signup" candidate: never-verified, 6+ months old, and
// zero rows in every owner-scoped table (§23.2's living list).
function abandonedCandidatePredicate() {
  return and(
    eq(user.emailVerified, false),
    lt(user.createdAt, sql`now() - interval '6 months'`),
    notExists(db.select({ x: brokerAccounts.id }).from(brokerAccounts).where(eq(brokerAccounts.ownerUserId, user.id))),
    notExists(db.select({ x: imports.id }).from(imports).where(eq(imports.ownerUserId, user.id))),
    notExists(db.select({ x: instruments.id }).from(instruments).where(eq(instruments.ownerUserId, user.id))),
    notExists(db.select({ x: transactions.id }).from(transactions).where(eq(transactions.ownerUserId, user.id))),
    notExists(db.select({ x: positions.ownerUserId }).from(positions).where(eq(positions.ownerUserId, user.id))),
    notExists(db.select({ x: taxReports.id }).from(taxReports).where(eq(taxReports.ownerUserId, user.id))),
    notExists(db.select({ x: taxReportLines.id }).from(taxReportLines).where(eq(taxReportLines.ownerUserId, user.id))),
    notExists(db.select({ x: lots.id }).from(lots).where(eq(lots.ownerUserId, user.id))),
    notExists(db.select({ x: realizedMatches.id }).from(realizedMatches).where(eq(realizedMatches.ownerUserId, user.id))),
    notExists(db.select({ x: userSettings.ownerUserId }).from(userSettings).where(eq(userSettings.ownerUserId, user.id))),
    notExists(db.select({ x: cryptoAccounts.id }).from(cryptoAccounts).where(eq(cryptoAccounts.ownerUserId, user.id))),
    notExists(db.select({ x: cryptoWallets.cryptoAccountId }).from(cryptoWallets).where(eq(cryptoWallets.ownerUserId, user.id))),
    notExists(db.select({ x: cryptoDailyValues.ownerUserId }).from(cryptoDailyValues).where(eq(cryptoDailyValues.ownerUserId, user.id))),
  );
}
```

(`notExists`/`sql` are real `drizzle-orm` exports — verified directly
against `node_modules/drizzle-orm/sql/expressions/conditions.d.ts` in this
session, not assumed.)

**Dry-run mode (ship first — see §23.4):**

```ts
const candidates = await db
  .select({ id: user.id, email: user.email, createdAt: user.createdAt })
  .from(user)
  .where(abandonedCandidatePredicate());

console.log(JSON.stringify({
  event: "auth-cleanup.abandoned-accounts.dry-run",
  count: candidates.length,
  candidates: candidates.map((c) => ({ id: c.id, email: c.email, createdAt: c.createdAt })),
}));
```

**Real deletion mode**, once `AUTH_CLEANUP_DELETE_ENABLED=true` (§23.4),
wrapped in a transaction so the audit log always matches exactly what was
deleted, and so the safeguard is re-checked at delete time rather than
trusted from a stale list:

```ts
const deleted = await db.transaction(async (tx) => {
  const candidates = await tx
    .select({ id: user.id, email: user.email, createdAt: user.createdAt })
    .from(user)
    .where(abandonedCandidatePredicate());

  if (candidates.length === 0) return candidates;

  await tx.delete(user).where(inArray(user.id, candidates.map((c) => c.id)));
  // `account`/`session` rows cascade-delete automatically
  // (onDelete: "cascade", schema.ts:71/80) — no separate DELETE needed.
  return candidates;
});

console.log(JSON.stringify({
  event: "auth-cleanup.abandoned-accounts.deleted",
  count: deleted.length,
  deleted: deleted.map((d) => ({ id: d.id, email: d.email, createdAt: d.createdAt })),
}));
```

Selecting inside the **same transaction** as the delete closes the
TOCTOU gap: if a candidate somehow acquired real data between an earlier
dry-run log line and this run, `abandonedCandidatePredicate()` is
re-evaluated fresh here, so it simply won't appear in `candidates` this
time — the safeguard is checked at the moment of deletion, not trusted
from a list computed earlier.

### 23.4 Dry-run-first rollout, and audit trail

**Recommend dry-run/log-only first** — this operation is irreversible and
no dedicated audit-log table exists in this schema (confirmed —
`src/lib/db/schema.ts` has no such table), so validating the predicate
against real data before it deletes anything matters more than usual:

- New env var `AUTH_CLEANUP_DELETE_ENABLED` (`z.enum(["true","false"]).default("false")`
  in `src/lib/env.ts`, read via `process.env` directly in the route, per
  this module's existing convention — same pattern as `getSignupMode()`,
  §2).
- Ship the PR with it unset (`"false"`) — the cron runs daily, logs the
  dry-run candidate list, deletes nothing. Recommend running dry-run for
  at least a few weeks and reviewing the logged candidate list before
  flipping this to `"true"` — the goal is confidence that the list looks
  like genuinely abandoned stub accounts, not real users.
- **Audit trail:** log-only, via the cron's own console output — captured
  both by the GitHub Actions workflow run log (`auth-cleanup.yml`,
  mirroring `quotes-refresh.yml`'s pattern, §18) and Vercel's function
  logs, giving two independent retention copies without adding a new
  schema/table. Not recommending a dedicated audit-log table for this —
  that would be schema scope creep for a single, rare, already-logged
  operation; if audit requirements grow later (e.g. compliance wants
  queryable history), that's a bigger, separate decision.
- The route's JSON response should reflect which mode ran (`dryRun: true`
  vs. `false`) so each day's log line is self-describing.

### 23.5 File-by-file addendum (extends §20, does not replace it)

| File | Change |
|---|---|
| `src/app/api/cron/auth-cleanup/route.ts` | (extends §18, same route, same file) two sweeps: (1) `DELETE FROM verification WHERE expires_at < now()` (§18, unchanged); (2) abandoned-account sweep per §23.3, gated by `AUTH_CLEANUP_DELETE_ENABLED` (§23.4) |
| `src/lib/env.ts` | add `AUTH_CLEANUP_DELETE_ENABLED: z.enum(["true","false"]).default("false")` |

---

## 24. Decision 6 (user-confirmed): null out unused OAuth `accessToken`/`refreshToken`/`idToken` columns

Per the data-lifecycle doc's AC-26 data-minimization flag: this app never
calls back to Google/GitHub APIs post-authentication (confirmed — no code
path does), so persisting these tokens serves no purpose. User has
confirmed: proceed.

Two parts, both needed since one only fixes new rows and the other only
fixes rows that already exist:

### 24.1 Forward fix — stop writing them going forward

`databaseHooks.account.create.before` in `src/lib/auth/setup.ts` (same
hook family already used for `user.create.before`, §2), mutating the
object before insert for OAuth-linked accounts only (leave
`providerId === "credential"` rows alone — that branch's `password`
column is the one token-shaped field it actually needs):

```ts
account: {
  create: {
    before: async (acct) => {
      if (acct.providerId !== "credential") {
        return { data: { ...acct, accessToken: null, refreshToken: null, idToken: null } };
      }
      return { data: acct };
    },
  },
},
```

**Verification caveat (same discipline as §2/§11's own hooks):** I have
not independently re-verified `databaseHooks.account.create.before`'s
exact signature against the installed `better-auth@1.6.11` source in this
session — developer/`code-reviewer` should confirm the hook name and
return shape against `node_modules/better-auth` before merging, per this
doc's own grounding standard, rather than trust this pseudocode as final.

### 24.2 Backfill — clear existing rows

One-time data migration (not a recurring cron — this app currently has
only the ~5 originally-invited users pre-feature, so this is a single,
small, reviewable statement, not a scale concern):

```sql
UPDATE account
SET access_token = NULL, refresh_token = NULL, id_token = NULL
WHERE provider_id <> 'credential'
  AND (access_token IS NOT NULL OR refresh_token IS NOT NULL OR id_token IS NOT NULL);
```

Run once, by hand or as a one-off script, as part of this PR's rollout —
not gated behind a cron or feature flag, since it's a single,
reversible-in-effect (nulling, not deleting rows) statement.

No Drizzle migration — no column is added or removed, only existing
nullable columns (`account.accessToken`/`refreshToken`/`idToken`, already
nullable in `schema.ts`) are set to `null`.

---

## 25. Sequencing note

Sections 23 and 24 both extend files already touched by the rest of
Amendment 1 (`src/lib/auth/setup.ts`, `src/lib/env.ts`,
`src/app/api/cron/auth-cleanup/route.ts`) — per §22 item 5's resolution,
all of this ships in one PR, so there is no cross-PR sequencing risk to
manage here.

---

## 26. Decision 5 (user-confirmed): real privacy-policy page

Drafted directly this session as `src/app/privacy/page.tsx` — a real
file, not just doc content. Judgment call on "file vs. doc content" (the
task explicitly left this as the architect's call): this is simple static
content, and I was confident enough in matching `src/app/sign-in/page.tsx`'s
existing Server Component + Tailwind-utility conventions (`bg-panel`/
`border-border` cards, `font-mono uppercase tracking-widest` labels,
`text-mint` accent, `max-w-[...] mx-auto px-5 sm:px-7 py-10 sm:py-16`
container rhythm) to write it directly rather than hand it to `developer`
as prose to transcribe.

Content is grounded directly in the companion data-lifecycle doc rather
than generic boilerplate:
- **What's collected / why** ← AC-25 process inventory, AC-26 table
  inventory. Lawful basis: Art. 6(1)(b) GDPR (contract performance) for
  core account/statement/tax data, Art. 6(1)(f) (legitimate interest) for
  session IP/user-agent and rate-limiting.
- **Who it's shared with** ← AC-27. Named subprocessors: Vercel (hosting),
  Neon (database), Resend (transactional email only — verification/reset
  links, no name/financial/tax data ever included), Google/GitHub (OAuth,
  pre-existing), Coinbase (user-initiated connection, not a classic
  subprocessor — disclosed anyway since balance/transaction data flows
  through it). Market-data providers (Yahoo, FMP, Twelve Data, Stooq,
  CoinGecko) are explicitly distinguished as **symbol/date-only lookups
  with no personal data sent**, verified by reading each provider client
  (`src/lib/quotes/*.ts`, `src/lib/marketdata/*.ts`) — none of them
  receive a name, email, or account identifier in any request.
- **Retention** ← AC-28, now closed by §23's 6-month sweep for abandoned
  sign-ups, plus the general "for as long as your account exists" default,
  plus a note (not a specific figure — no BMF-verified retention period is
  asserted here, consistent with this repo's tax-correctness discipline)
  that German tax law may separately require certain financial-record
  retention independent of this policy.
- **User rights / gap** ← AC-29. The page explicitly and prominently
  flags that **no self-service account-deletion UI exists today** — the
  only automated deletion is the §23 abandoned-sign-up sweep, so a real,
  verified, active user currently has no in-product erasure path and must
  contact the operator directly. This is stated as a real, separate gap in
  the page itself, not silently smoothed over.

**Known placeholders left in the page, deliberately not invented:**
data-controller legal name/address (Art. 13(1)(a) requires this — I have
no authority to assert a legal identity on the user's behalf), a real
monitored contact address (`privacy@ptfolio.net` is a plausible-looking
placeholder given the `mail.ptfolio.net` sending domain already verified
for Resend, but is **not confirmed to exist/be monitored** — flagged
in-page), and Resend's processing region/DPA (carried over from the
data-lifecycle doc's still-open Summary item 2, §22's "still open" note).

**Not done in this session, flagged for `developer`:** linking the page
from anywhere in the app. The natural spot is a small footer link on
`src/app/sign-in/page.tsx` (already being rewritten per §6.1) — one line,
low risk, but touches a file this doc already specs changes for elsewhere,
so I'm flagging it as a line item for whoever implements §6.1 rather than
editing that file directly in this pass.

**The mandatory caveat, restated plainly (not just here — it is also
inline in the page itself and in the report accompanying this doc):**
this is a first-draft privacy policy grounded in accurate technical
fact-finding about what this app actually does with data. It has **not**
been reviewed by a lawyer. Privacy-policy text is a legal document — have
a lawyer or your own judgment review it before treating it as binding
compliance, especially since this app now targets an unbounded public
German user base under GDPR/BDSG. Nothing in this section should be read
as asserting this draft's legal sufficiency.

No Drizzle migration; no other file changes required for this page to
render (it's a self-contained Server Component, same pattern as
`src/app/sign-in/page.tsx`).

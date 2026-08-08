# In-App Feedback Form → Email — Design Spec

Design deliverable for the normal `architect → developer → code-reviewer →
tester → documentation-writer` flow. Scope is deliberately small: a
signed-in-only "contact me" form that emails each submission to the owner.
No database table, no admin UI — email is the only sink (owner decision,
2026-08-08).

Skills to apply downstream: `nextjs-security` + `nextjs-best-practices`
(route handler, input handling), `react-best-practices` (modal form),
`qa-testing` (route-handler tests). No tax/PII-ledger surface touched; the
only personal data handled is the submitter's own session email/name, which
is already known to the app.

## 0. Decisions (locked with owner)

1. **Sink:** email only, via the existing Resend helper. No `feedback` table,
   no migration.
2. **Audience:** signed-in users only. The endpoint is auth-gated; logged-out
   visitors have no path to it (public path is explicitly out of scope for v1).
3. **Form fields:** a `category` dropdown (Bug / Idea / Question / Other) + a
   required free-text `message`. Identity is taken from the session, never
   typed.
4. **Placement:** a "Feedback" trigger in the app header that opens the form
   in a **modal**, mirroring the existing auth-modal pattern.
5. **Destination inbox:** `support@ptfolio.net`, forwarded to the owner's
   Gmail via ImprovMX (free forwarding). `reply-to` on each email is set to
   the submitter so the owner replies straight from Gmail.

## 1. Endpoint — `POST /api/feedback`

New App Router route handler at `src/app/api/feedback/route.ts`.

Flow:
1. **Auth gate.** Resolve the session via `getCurrentUser()`
   (`src/lib/auth/server.ts`). If `null` → `401` (JSON `{ error }`). This is
   the only membership check needed; no role gate.
2. **Validate** the JSON body with a zod schema (zod `^3.23.8` already in the
   project):
   - `category`: `z.enum(["bug", "idea", "question", "other"])`.
   - `message`: `z.string().trim().min(1).max(5000)`.
   On failure → `400` with a generic message (no field-level echo needed).
3. **Throttle.** Best-effort per-user rate limit (e.g. 5 sends / 60s keyed by
   user id). In-memory is acceptable given serverless caveats — this is a
   courtesy guard against an accidental double-submit or a single logged-in
   abuser, not a security boundary (the auth gate is). → `429` if exceeded.
4. **Compose & send.** Call the Resend helper with:
   - `from`: `process.env.RESEND_FROM_EMAIL` (unchanged; `mail.ptfolio.net`).
   - `to`: `process.env.FEEDBACK_TO_EMAIL` (new; `support@ptfolio.net`).
   - `replyTo`: the submitter's session email.
   - `subject`: `` `[${CategoryLabel}] Feedback from ${user.name ?? user.email}` ``.
   - `html`: a small template embedding category, submitter name + email, and
     the message. **The message and name MUST be HTML-escaped** before
     interpolation (see §3).
5. **Respond.** `200 { ok: true }` on success; `500 { error }` if the send
   throws. Do not leak provider error detail to the client.

## 2. Resend helper change

`src/lib/email/resend.ts`'s `sendEmail(...)` currently accepts
`{ to, subject, html }`. Add an optional `replyTo?: string` and pass it
through to `resend.emails.send({ from, to, subject, html, replyTo })`.
Existing callers (verification, password-reset) are unaffected — the field is
optional and omitted there.

## 3. Security notes

- **HTML injection into the owner's inbox.** `message` and `name` are
  user-controlled and land in an HTML email body. Escape `& < > " '` before
  interpolation (small local helper or reuse an existing escape util if one
  exists). This is the single most important correctness detail in the
  feature — an un-escaped message lets a submitter inject markup into the
  email the owner reads.
- **No enumeration / no new PII store.** Nothing is persisted; the only data
  in flight is the submitter's own identity, already held by the session.
- **Auth is the boundary, throttle is a courtesy.** Do not rely on the rate
  limiter for security; it is best-effort on serverless.

## 4. UI — feedback modal

- Client component (e.g. `src/components/feedback/feedback-modal.tsx` + a
  header trigger), following the existing auth-modal composition
  (`src/components/auth/auth-modal-trigger.tsx`) for consistency.
- Fields: `Type` `<select>` (four options) + required `message` `<textarea>`
  + Send button. Disabled/spinner state while posting.
- On `200`: replace the form body with a success line
  ("Thanks — I'll get back to you.") and allow closing.
- On `400/429/500`: inline error message, keep the entered text so nothing is
  lost, allow retry.
- Trigger placement: the app header (authenticated shell), not the public
  sign-in landing.

## 5. Config

New env var `FEEDBACK_TO_EMAIL`:
- `.env.local` (local) and Vercel Production/Preview → `support@ptfolio.net`.
- `.env.example` → documented placeholder (`support@yourdomain.tld`).
Keeps the destination out of source.

## 6. Inbox setup (ops — outside the codebase)

At Squarespace DNS for `ptfolio.net`, add ImprovMX records, then create the
alias in the ImprovMX dashboard (`support@ptfolio.net → owner Gmail`):
- MX `@` → `mx1.improvmx.com` (priority 10), `mx2.improvmx.com` (priority 20).
- TXT `@` → `v=spf1 include:spf.improvmx.com ~all`.

**No SPF conflict:** Resend's sending records live on the `mail.ptfolio.net`
subdomain; ImprovMX's MX/SPF live on the apex `ptfolio.net`. Different DNS
names, so the apex has no pre-existing `v=spf1` to merge with.

Limitation (accepted for v1): free ImprovMX forwards inbound only. The owner
replies from their Gmail address; because `reply-to` is the submitter, the
reply reaches them correctly — it just won't appear as "from support@".
Send-as `support@` would need paid ImprovMX SMTP and is out of scope.

## 7. Testing (TDD)

Route-handler unit tests (`sendEmail` mocked):
- Unauthenticated (no session) → `401`, `sendEmail` not called.
- Invalid body (bad `category`, empty `message`, over-length) → `400`.
- **XSS payload in `message` is HTML-escaped** in the `html` passed to
  `sendEmail` (assert the raw `<script>`/tags do not appear un-escaped).
- Happy path → `sendEmail` called once with correct `to` (= `FEEDBACK_TO_EMAIL`),
  `replyTo` (= session email), and category-prefixed subject; response `200`.
- Send failure (helper throws) → `500`, no provider detail leaked.
- (Optional) throttle: N+1 rapid calls from same user → `429`.

## 8. Out of scope (v1)

Public/logged-out submission, DB persistence + admin view, attachments,
send-as `support@`, auto-reply to the submitter.

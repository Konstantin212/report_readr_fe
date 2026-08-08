# Feedback Form → Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let signed-in users send a categorized feedback message that is emailed to the owner's inbox (`support@ptfolio.net`), with reply-to set to the submitter.

**Architecture:** A thin `POST /api/feedback` route handler auth-gates via the existing `getCurrentUser()`, validates the body with zod, composes an HTML-escaped email in a pure `feedback-email` module, and sends it through the existing Resend helper (extended to support `replyTo`). No database — email is the only sink. A client modal opened from the authenticated topbar drives the form.

**Tech Stack:** Next.js 15 App Router route handler (`runtime = "nodejs"`), React 19 client component, zod (`^3.23.8`, already present), Resend (already wired), lucide-react (already present), Vitest.

**Design spec:** `docs/superpowers/specs/2026-08-08-feedback-form-design.md`

## Global Constraints

- Package manager is **pnpm** only (never npm/yarn). Node **>= 24**.
- Tests live under `tests/**/*.test.ts` (Vitest, `environment: node`, `@` → `src`). Do NOT put `*.test.ts` under `src/`.
- Do NOT add new dependencies — zod, resend, lucide-react are all already in `package.json`.
- Do NOT bump Next.js version as part of this work (repo pins `^15.1.0`; the `>= 15.2.3` floor is tracked separately — flag, don't fix here).
- Route handlers that use the Resend SDK MUST declare `export const runtime = "nodejs"`.
- Read env via `process.env.*` directly (matches `src/lib/email/resend.ts` convention), not a parsed env module.
- Pre-push hook runs `pnpm typecheck && pnpm lint && pnpm test && pnpm build` and must pass.
- Category values are the enum `["bug","idea","question","other"]`; labels are `Bug / Idea / Question / Other`. Subject format is exactly `[<Label>] Feedback from <name-or-email>`.
- The user's message is user-controlled and lands in an HTML email — it MUST be HTML-escaped before interpolation.

## File Structure

- Create `src/lib/feedback/categories.ts` — category enum + labels (no server deps; safe to import client-side).
- Create `src/lib/feedback/feedback-email.ts` — zod schema + `composeFeedbackEmail()` (escaping, subject, reads `FEEDBACK_TO_EMAIL`). Server-only.
- Create `src/lib/feedback/rate-limit.ts` — best-effort in-memory per-user throttle.
- Create `src/app/api/feedback/route.ts` — the `POST` handler wiring the above.
- Create `src/components/feedback/feedback-modal.tsx` — client modal (form + states).
- Create `src/components/feedback/feedback-trigger.tsx` — topbar button that opens the modal.
- Modify `src/lib/email/resend.ts` — add optional `replyTo`.
- Modify `src/components/pulse/topbar.tsx` — render `<FeedbackTrigger />`.
- Modify `.env.example` — document `FEEDBACK_TO_EMAIL`.
- Tests: `tests/lib/email/resend.test.ts` (extend), `tests/lib/feedback/feedback-email.test.ts`, `tests/lib/feedback/rate-limit.test.ts`, `tests/api/feedback.test.ts`.

---

### Task 1: Add `replyTo` to the Resend helper

**Files:**
- Modify: `src/lib/email/resend.ts:32-57`
- Test: `tests/lib/email/resend.test.ts` (extend)

**Interfaces:**
- Produces: `SendEmailInput` gains optional `replyTo?: string`; `sendEmail(input: SendEmailInput): Promise<void>` passes it to `resend.emails.send`.

- [ ] **Step 1: Write the failing tests** — append to `tests/lib/email/resend.test.ts` (reuses the file's existing `sendMock` / `importFresh` / env setup):

```ts
describe("sendEmail replyTo", () => {
  it("passes replyTo through to Resend when provided", async () => {
    sendMock.mockResolvedValue({ data: { id: "x" }, error: null });
    const { sendEmail } = await importFresh();
    await sendEmail({ to: "a@b.c", subject: "s", html: "<p>h</p>", replyTo: "user@x.com" });
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ replyTo: "user@x.com" }));
  });

  it("omits replyTo when not provided", async () => {
    sendMock.mockResolvedValue({ data: { id: "x" }, error: null });
    const { sendEmail } = await importFresh();
    await sendEmail({ to: "a@b.c", subject: "s", html: "<p>h</p>" });
    expect(sendMock.mock.calls[0][0].replyTo).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/lib/email/resend.test.ts`
Expected: FAIL — the new `replyTo` is not yet passed through.

- [ ] **Step 3: Implement** — in `src/lib/email/resend.ts`, add the optional field and thread it through:

```ts
export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}
```

```ts
export async function sendEmail({ to, subject, html, replyTo }: SendEmailInput): Promise<void> {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) {
    throw new Error("RESEND_FROM_EMAIL is not set.");
  }

  const resend = getResendClient();
  const { error } = await resend.emails.send({ from, to, subject, html, replyTo });

  if (error) {
    throw new Error(`Failed to send email via Resend: ${error.message}`);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/lib/email/resend.test.ts`
Expected: PASS (all existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/resend.ts tests/lib/email/resend.test.ts
git commit -m "feat(email): support optional replyTo in Resend helper"
```

---

### Task 2: Categories + feedback-email compose module

**Files:**
- Create: `src/lib/feedback/categories.ts`
- Create: `src/lib/feedback/feedback-email.ts`
- Test: `tests/lib/feedback/feedback-email.test.ts`

**Interfaces:**
- Consumes: `SendEmailInput` (Task 1), `AppSessionUser` from `@/lib/auth/server` (`{ id: string; email: string; name?: string }`).
- Produces:
  - `FEEDBACK_CATEGORIES = ["bug","idea","question","other"] as const`, `type FeedbackCategory`, `FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory,string>`.
  - `feedbackSchema` (zod) with `type FeedbackInput = { category: FeedbackCategory; message: string }`.
  - `composeFeedbackEmail({ input, user }: { input: FeedbackInput; user: AppSessionUser }): SendEmailInput`.

- [ ] **Step 1: Write the failing tests** — `tests/lib/feedback/feedback-email.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { feedbackSchema, composeFeedbackEmail } from "@/lib/feedback/feedback-email";

const ORIGINAL = process.env.FEEDBACK_TO_EMAIL;
beforeEach(() => { process.env.FEEDBACK_TO_EMAIL = "support@ptfolio.net"; });
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.FEEDBACK_TO_EMAIL;
  else process.env.FEEDBACK_TO_EMAIL = ORIGINAL;
});

describe("feedbackSchema", () => {
  it("accepts a valid submission", () => {
    expect(feedbackSchema.safeParse({ category: "bug", message: "hi" }).success).toBe(true);
  });
  it("rejects an unknown category", () => {
    expect(feedbackSchema.safeParse({ category: "spam", message: "hi" }).success).toBe(false);
  });
  it("rejects a whitespace-only message", () => {
    expect(feedbackSchema.safeParse({ category: "bug", message: "   " }).success).toBe(false);
  });
  it("rejects an over-length message", () => {
    expect(feedbackSchema.safeParse({ category: "bug", message: "x".repeat(5001) }).success).toBe(false);
  });
});

describe("composeFeedbackEmail", () => {
  const user = { id: "u1", email: "jane@example.com", name: "Jane" };

  it("throws when FEEDBACK_TO_EMAIL is unset", () => {
    delete process.env.FEEDBACK_TO_EMAIL;
    expect(() => composeFeedbackEmail({ input: { category: "bug", message: "hi" }, user })).toThrow();
  });

  it("targets FEEDBACK_TO_EMAIL, category-prefixed subject, reply-to = submitter", () => {
    const out = composeFeedbackEmail({ input: { category: "bug", message: "hi" }, user });
    expect(out.to).toBe("support@ptfolio.net");
    expect(out.subject).toBe("[Bug] Feedback from Jane");
    expect(out.replyTo).toBe("jane@example.com");
  });

  it("falls back to email in the subject when name is absent", () => {
    const out = composeFeedbackEmail({
      input: { category: "idea", message: "hi" },
      user: { id: "u2", email: "no-name@example.com" },
    });
    expect(out.subject).toBe("[Idea] Feedback from no-name@example.com");
  });

  it("HTML-escapes the message so injected markup cannot break out", () => {
    const out = composeFeedbackEmail({
      input: { category: "other", message: "<script>alert(1)</script>" },
      user,
    });
    expect(out.html).not.toContain("<script>");
    expect(out.html).toContain("&lt;script&gt;");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/lib/feedback/feedback-email.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement categories** — `src/lib/feedback/categories.ts`:

```ts
export const FEEDBACK_CATEGORIES = ["bug", "idea", "question", "other"] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: "Bug",
  idea: "Idea",
  question: "Question",
  other: "Other",
};
```

- [ ] **Step 4: Implement feedback-email** — `src/lib/feedback/feedback-email.ts`:

```ts
import { z } from "zod";

import type { AppSessionUser } from "@/lib/auth/server";
import type { SendEmailInput } from "@/lib/email/resend";
import { FEEDBACK_CATEGORIES, FEEDBACK_CATEGORY_LABELS } from "./categories";

export const feedbackSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES),
  message: z.string().trim().min(1).max(5000),
});

export type FeedbackInput = z.infer<typeof feedbackSchema>;

/** Escapes the five HTML-significant characters. The message and name are
 *  user-controlled and interpolated into an HTML email body. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function composeFeedbackEmail({
  input,
  user,
}: {
  input: FeedbackInput;
  user: AppSessionUser;
}): SendEmailInput {
  const to = process.env.FEEDBACK_TO_EMAIL;
  if (!to) {
    throw new Error("FEEDBACK_TO_EMAIL is not set.");
  }

  const label = FEEDBACK_CATEGORY_LABELS[input.category];
  const who = user.name ?? user.email;
  const subject = `[${label}] Feedback from ${who}`;

  const safeName = escapeHtml(user.name ?? "");
  const safeEmail = escapeHtml(user.email);
  const safeMessage = escapeHtml(input.message).replace(/\n/g, "<br>");

  const html = `
    <div style="font-family: sans-serif; line-height: 1.5;">
      <p><strong>Category:</strong> ${label}</p>
      <p><strong>From:</strong> ${safeName} &lt;${safeEmail}&gt;</p>
      <hr />
      <p>${safeMessage}</p>
    </div>
  `.trim();

  return { to, subject, html, replyTo: user.email };
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm vitest run tests/lib/feedback/feedback-email.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/feedback/categories.ts src/lib/feedback/feedback-email.ts tests/lib/feedback/feedback-email.test.ts
git commit -m "feat(feedback): add categories + email compose module with HTML escaping"
```

---

### Task 3: Per-user rate-limit module

**Files:**
- Create: `src/lib/feedback/rate-limit.ts`
- Test: `tests/lib/feedback/rate-limit.test.ts`

**Interfaces:**
- Produces: `allowFeedback(userId: string, now?: number): boolean` (records the hit and returns whether within budget); `_resetFeedbackRateLimit(): void` (test-only).

- [ ] **Step 1: Write the failing tests** — `tests/lib/feedback/rate-limit.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { allowFeedback, _resetFeedbackRateLimit } from "@/lib/feedback/rate-limit";

beforeEach(() => { _resetFeedbackRateLimit(); });

describe("allowFeedback", () => {
  it("allows 5 sends in the window then blocks the 6th", () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) expect(allowFeedback("u1", now)).toBe(true);
    expect(allowFeedback("u1", now)).toBe(false);
  });

  it("frees budget once the window passes", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) allowFeedback("u1", t0);
    expect(allowFeedback("u1", t0)).toBe(false);
    expect(allowFeedback("u1", t0 + 60_001)).toBe(true);
  });

  it("tracks users independently", () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) allowFeedback("u1", now);
    expect(allowFeedback("u2", now)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/lib/feedback/rate-limit.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement** — `src/lib/feedback/rate-limit.ts`:

```ts
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;

const hits = new Map<string, number[]>();

/**
 * Best-effort in-memory per-user throttle. Serverless caveat: state is
 * per-instance and not shared across function instances, so this guards
 * against an accidental rapid re-submit or a single logged-in abuser — it
 * is NOT a security boundary (the route's auth gate is). Returns true and
 * records the hit when within budget; false when over.
 */
export function allowFeedback(userId: string, now: number = Date.now()): boolean {
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(userId, recent);
    return false;
  }
  recent.push(now);
  hits.set(userId, recent);
  return true;
}

// Test-only. Clears all recorded hits.
export function _resetFeedbackRateLimit(): void {
  hits.clear();
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/lib/feedback/rate-limit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/feedback/rate-limit.ts tests/lib/feedback/rate-limit.test.ts
git commit -m "feat(feedback): best-effort per-user rate limit"
```

---

### Task 4: `POST /api/feedback` route handler + env docs

**Files:**
- Create: `src/app/api/feedback/route.ts`
- Modify: `.env.example`
- Test: `tests/api/feedback.test.ts`

**Interfaces:**
- Consumes: `getCurrentUser` (`@/lib/auth/server`), `sendEmail` (`@/lib/email/resend`), `feedbackSchema` + `composeFeedbackEmail` (`@/lib/feedback/feedback-email`), `allowFeedback` (`@/lib/feedback/rate-limit`).
- Produces: `POST(request: Request): Promise<Response>` — `401` unauth, `429` throttled, `400` bad JSON/invalid body, `500` send failure, `200 { ok: true }` success.

- [ ] **Step 1: Write the failing tests** — `tests/api/feedback.test.ts` (mock pattern mirrors `tests/api/admin-panel-users-id.test.ts`; `composeFeedbackEmail` is NOT mocked, so `FEEDBACK_TO_EMAIL` must be set):

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetCurrentUser } = vi.hoisted(() => ({ mockGetCurrentUser: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ getCurrentUser: mockGetCurrentUser }));

const { mockSendEmail } = vi.hoisted(() => ({ mockSendEmail: vi.fn() }));
vi.mock("@/lib/email/resend", () => ({ sendEmail: mockSendEmail }));

const { mockAllowFeedback } = vi.hoisted(() => ({ mockAllowFeedback: vi.fn() }));
vi.mock("@/lib/feedback/rate-limit", () => ({ allowFeedback: mockAllowFeedback }));

const ORIGINAL_TO = process.env.FEEDBACK_TO_EMAIL;

function postRequest(body: unknown) {
  return new Request("http://x/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  mockGetCurrentUser.mockReset();
  mockSendEmail.mockReset().mockResolvedValue(undefined);
  mockAllowFeedback.mockReset().mockReturnValue(true);
  process.env.FEEDBACK_TO_EMAIL = "support@ptfolio.net";
});

afterEach(() => {
  vi.resetModules();
  if (ORIGINAL_TO === undefined) delete process.env.FEEDBACK_TO_EMAIL;
  else process.env.FEEDBACK_TO_EMAIL = ORIGINAL_TO;
});

describe("POST /api/feedback", () => {
  it("401 when not signed in; does not send", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const { POST } = await import("@/app/api/feedback/route");
    const res = await POST(postRequest({ category: "bug", message: "hi" }));
    expect(res.status).toBe(401);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("429 when the rate limiter rejects; does not send", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "u1", email: "j@x.com" });
    mockAllowFeedback.mockReturnValue(false);
    const { POST } = await import("@/app/api/feedback/route");
    const res = await POST(postRequest({ category: "bug", message: "hi" }));
    expect(res.status).toBe(429);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("400 on malformed JSON", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "u1", email: "j@x.com" });
    const { POST } = await import("@/app/api/feedback/route");
    const res = await POST(postRequest("not json"));
    expect(res.status).toBe(400);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("400 on invalid body (bad category / empty message)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "u1", email: "j@x.com" });
    const { POST } = await import("@/app/api/feedback/route");
    const res = await POST(postRequest({ category: "nope", message: "" }));
    expect(res.status).toBe(400);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("200 on success; sends one email with correct to/replyTo/subject", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "u1", email: "jane@x.com", name: "Jane" });
    const { POST } = await import("@/app/api/feedback/route");
    const res = await POST(postRequest({ category: "bug", message: "it broke" }));
    expect(res.status).toBe(200);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const arg = mockSendEmail.mock.calls[0][0];
    expect(arg.to).toBe("support@ptfolio.net");
    expect(arg.replyTo).toBe("jane@x.com");
    expect(arg.subject).toBe("[Bug] Feedback from Jane");
  });

  it("does not pass the raw message as unescaped HTML", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "u1", email: "j@x.com", name: "J" });
    const { POST } = await import("@/app/api/feedback/route");
    await POST(postRequest({ category: "other", message: "<script>x</script>" }));
    expect(mockSendEmail.mock.calls[0][0].html).not.toContain("<script>");
  });

  it("500 when sending fails", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "u1", email: "j@x.com" });
    mockSendEmail.mockRejectedValue(new Error("resend down"));
    const { POST } = await import("@/app/api/feedback/route");
    const res = await POST(postRequest({ category: "bug", message: "hi" }));
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/api/feedback.test.ts`
Expected: FAIL — route does not exist.

- [ ] **Step 3: Implement** — `src/app/api/feedback/route.ts`:

```ts
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import { sendEmail } from "@/lib/email/resend";
import { composeFeedbackEmail, feedbackSchema } from "@/lib/feedback/feedback-email";
import { allowFeedback } from "@/lib/feedback/rate-limit";

export const runtime = "nodejs";

/**
 * Signed-in users submit feedback; each submission is emailed to
 * FEEDBACK_TO_EMAIL with reply-to set to the submitter. Email is the only
 * sink — nothing is persisted (design spec 2026-08-08-feedback-form §0).
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!allowFeedback(user.id)) {
    return NextResponse.json(
      { error: "Too many messages — please wait a moment." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please choose a type and enter a message." },
      { status: 400 },
    );
  }

  try {
    await sendEmail(composeFeedbackEmail({ input: parsed.data, user }));
  } catch {
    return NextResponse.json(
      { error: "Could not send your message. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Document the env var** — append to `.env.example` (place near `RESEND_FROM_EMAIL`):

```bash
# Destination inbox for the in-app feedback form (forwarded to the owner's
# mailbox, e.g. via ImprovMX). Only the /api/feedback route reads this.
FEEDBACK_TO_EMAIL=support@yourdomain.tld
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm vitest run tests/api/feedback.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/feedback/route.ts .env.example tests/api/feedback.test.ts
git commit -m "feat(feedback): POST /api/feedback route (auth-gated, validated, emailed)"
```

> **Ops (out of code, do once):** set `FEEDBACK_TO_EMAIL=support@ptfolio.net` in `.env.local` and in Vercel (Production + Preview), then redeploy. The `support@ptfolio.net` ImprovMX alias + Squarespace DNS records are set up separately (design spec §6).

---

### Task 5: Feedback modal + topbar trigger

**Files:**
- Create: `src/components/feedback/feedback-modal.tsx`
- Create: `src/components/feedback/feedback-trigger.tsx`
- Modify: `src/components/pulse/topbar.tsx:5` (import) and `:23-27` (render)

**Interfaces:**
- Consumes: `FEEDBACK_CATEGORIES`, `FEEDBACK_CATEGORY_LABELS`, `FeedbackCategory` (`@/lib/feedback/categories`); posts to `POST /api/feedback` (Task 4).
- Produces: `<FeedbackTrigger />` (default-closed button rendered in the authenticated topbar).

> No unit test — this is presentational client UI verified by `pnpm typecheck`/`build` and manual smoke. (The behavior it drives — the endpoint — is fully covered by Task 4.)

- [ ] **Step 1: Implement the modal** — `src/components/feedback/feedback-modal.tsx`:

```tsx
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";

import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  type FeedbackCategory,
} from "@/lib/feedback/categories";

type Status = "idle" | "sending" | "sent" | "error";

/**
 * Signed-in feedback form in a modal. Mirrors the ESC + backdrop-click
 * close pattern of AuthModal. Posts to /api/feedback; identity is taken
 * server-side from the session, so no name/email fields here.
 */
export function FeedbackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, message }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }
      setStatus("sent");
      setMessage("");
    } catch {
      setError("Network error. Please try again.");
      setStatus("error");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-[rgba(6,7,9,.72)] backdrop-blur flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[440px] bg-panel border border-border rounded-2xl p-6"
        role="dialog"
        aria-modal="true"
        aria-label="Send feedback"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute -top-3 -right-3 z-10 w-[32px] h-[32px] rounded-md border border-borderHard bg-panel flex items-center justify-center text-muted hover:text-ink transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {status === "sent" ? (
          <div className="space-y-3">
            <h2 className="font-bold text-lg tracking-tight">Thanks!</h2>
            <p className="text-muted text-sm">I&apos;ll get back to you soon.</p>
            <button
              type="button"
              onClick={onClose}
              className="bg-mint text-bg font-mono text-xs uppercase tracking-widest px-4 py-2.5 rounded-lg font-semibold"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <h2 className="font-bold text-lg tracking-tight">Send feedback</h2>

            <label className="block space-y-1.5">
              <span className="font-mono text-[11px] text-muted uppercase tracking-widest">Type</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm"
              >
                {FEEDBACK_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{FEEDBACK_CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="font-mono text-[11px] text-muted uppercase tracking-widest">Message</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                maxLength={5000}
                rows={5}
                placeholder="What's on your mind?"
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm resize-y"
              />
            </label>

            {error && <p className="text-sm text-pink">{error}</p>}

            <button
              type="submit"
              disabled={status === "sending" || message.trim() === ""}
              className="bg-mint text-bg font-mono text-xs uppercase tracking-widest px-4 py-2.5 rounded-lg font-semibold disabled:opacity-50"
            >
              {status === "sending" ? "Sending…" : "Send"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement the trigger** — `src/components/feedback/feedback-trigger.tsx`:

```tsx
"use client";

import { useState } from "react";

import { FeedbackModal } from "./feedback-modal";

/** Topbar button that opens the feedback modal. Own client leaf so only
 *  the open/close state is client-side (the topbar stays a server component). */
export function FeedbackTrigger() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-mono text-xs uppercase tracking-widest text-muted hover:text-ink px-3 py-2 rounded-lg border border-border"
      >
        Feedback
      </button>
      <FeedbackModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
```

- [ ] **Step 3: Wire into the topbar** — in `src/components/pulse/topbar.tsx`, add the import alongside the others (after line 5):

```tsx
import { FeedbackTrigger } from "@/components/feedback/feedback-trigger";
```

and render it in the right-hand action cluster (before `<TourTrigger />`):

```tsx
      <div className="ml-auto flex items-center gap-2">
        <BrokerFilter />
        <FeedbackTrigger />
        <TourTrigger />
        <UserMenu name={user?.name} email={user?.email} isAdmin={isAdmin} />
      </div>
```

- [ ] **Step 4: Verify build + types**

Run: `pnpm typecheck && pnpm build`
Expected: PASS (no type errors; page compiles).

- [ ] **Step 5: Commit**

```bash
git add src/components/feedback/feedback-modal.tsx src/components/feedback/feedback-trigger.tsx src/components/pulse/topbar.tsx
git commit -m "feat(feedback): feedback modal + topbar trigger"
```

---

### Task 6: Full gate + docs

**Files:**
- Modify: `docs/INDEX.md`, changelog (per `documentation-writer` conventions), if the repo tracks features there.

- [ ] **Step 1: Run the full pre-push gate**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all PASS. (Note: per repo memory, a Bash-tool `pnpm lint` may show a false failure that the real `next lint`/pre-push hook does not — if lint fails, confirm against the pre-push hook.)

- [ ] **Step 2: Documentation** — hand off to the `documentation-writer` agent to add a docs entry + changelog line for the feedback feature and register it in `docs/INDEX.md`.

- [ ] **Step 3: Commit any doc changes**

```bash
git add docs/
git commit -m "docs(feedback): document in-app feedback form"
```

---

## Self-Review

- **Spec coverage:** §1 endpoint → Task 4; §2 resend replyTo → Task 1; §3 escaping/security → Task 2 (+asserted in Tasks 2 & 4); §4 UI modal + header trigger → Task 5; §5 `FEEDBACK_TO_EMAIL` config → Task 4 (`.env.example` + ops note); §6 inbox ops → out-of-code, noted in Task 4; §7 testing → Tasks 1–4. §8 out-of-scope items are not built. ✓
- **Placeholder scan:** every code/test step contains real content; no TBD/TODO. ✓
- **Type consistency:** `SendEmailInput.replyTo` (Task 1) consumed by `composeFeedbackEmail` return (Task 2) and asserted in Task 4; `allowFeedback(userId, now?)` signature identical in Tasks 3 & 4; `feedbackSchema` / `composeFeedbackEmail({ input, user })` identical across Tasks 2 & 4; `FeedbackCategory` shared by categories module + client (Task 5). ✓

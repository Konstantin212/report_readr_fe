import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * AC-11/AC-12 are UI-copy requirements ("no longer claims invitation is
 * required" / "must not contradict actual system behavior"). This repo has
 * no DOM-rendering test setup (`vitest.config.ts` runs in `environment:
 * "node"`, no jsdom/happy-dom, no @testing-library/react — confirmed via
 * `grep` of package.json) and no Playwright e2e coverage of the sign-in/
 * settings pages either, so these are asserted directly against the source
 * text rather than a rendered DOM. That's a deliberate, narrower substitute
 * for real component/e2e tests (see this file's own recommendation below),
 * not a claim that it fully replaces one — it only proves the *words*
 * regressed, not that they render correctly wired to `signupMode`/props at
 * runtime (that logic is covered separately: `getSignupMode()` itself has
 * unit tests in tests/auth/signup-mode.test.ts, and `settings/page.tsx`'s/
 * `sign-in/page.tsx`'s conditional wiring is simple enough — a single
 * ternary each, both read directly above — to review by eye against this
 * assertion).
 *
 * Recommendation for `developer`/future test-tooling investment: adding
 * `jsdom` + `@testing-library/react` (or Playwright component testing)
 * would let AC-11/AC-12/AC-15's "unverified" banner and similar UI-copy ACs
 * be verified against an actual render instead of source text — flagging
 * this rather than silently doing nothing, per this agent's mandate to
 * propose new test approaches when a real gap is found.
 */
const repoRoot = path.resolve(__dirname, "../..");

function readSrc(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("AC-11: sign-in page no longer claims the app is invite-only", () => {
  const signInSrc = readSrc("src/app/sign-in/page.tsx");

  it("does not contain 'invite-only' or equivalent gatekeeping copy", () => {
    expect(signInSrc.toLowerCase()).not.toMatch(/invite-only|invite only|by invitation/);
  });

  it("renders the AuthModalTrigger (opens the email+password sign-up entry point) reachably on the page", () => {
    expect(signInSrc).toMatch(/<AuthModalTrigger\b/);
  });

  it("AuthModalTrigger's modal wraps AuthCard, so the sign-up entry point is reachable end to end", () => {
    const triggerSrc = readSrc("src/components/auth/auth-modal-trigger.tsx");
    const modalSrc = readSrc("src/components/auth/auth-modal.tsx");
    expect(triggerSrc).toMatch(/<AuthModal\b/);
    expect(modalSrc).toMatch(/<AuthCard\b/);
  });

  it("AuthModalTrigger renders separate 'Sign in' and 'Create account' entry buttons, not just one", () => {
    const triggerSrc = readSrc("src/components/auth/auth-modal-trigger.tsx");
    expect(triggerSrc).toMatch(/>\s*Sign in\s*</);
    expect(triggerSrc).toMatch(/>\s*Create account\s*</);
  });
});

describe("AC-12: Members UI copy no longer misrepresents the allowlist as a sign-in precondition under open mode", () => {
  const settingsSrc = readSrc("src/app/(app)/settings/page.tsx");
  const membersManagerSrc = readSrc("src/components/pulse/members-manager.tsx");

  it("settings page's Members section copy branches on signupMode rather than asserting one universal claim", () => {
    // The old copy ("Emails allowed to sign in to this workspace... share
    // the sign-in link with them") unconditionally implied allowlist
    // membership was required to sign in — no longer true under open mode.
    expect(settingsSrc).toMatch(/signupMode === "open"/);
    expect(settingsSrc.toLowerCase()).toMatch(/sign-up is currently open to anyone/);
    expect(settingsSrc.toLowerCase()).toMatch(/sign-up is restricted/);
  });

  it("members-manager's empty-state copy no longer tells the admin to 'share /sign-in' as if that were gated by this list", () => {
    expect(membersManagerSrc.toLowerCase()).not.toMatch(/share.*\/sign-in/);
  });
});

describe("AC-29: privacy-policy gap is closed with a real page, linked from sign-in", () => {
  it("src/app/privacy/page.tsx exists with real content (not just a stub)", () => {
    const privacySrc = readSrc("src/app/privacy/page.tsx");
    expect(privacySrc.length).toBeGreaterThan(500);
  });

  it("sign-in page links to /privacy", () => {
    const signInSrc = readSrc("src/app/sign-in/page.tsx");
    expect(signInSrc).toMatch(/href="\/privacy"/);
  });
});

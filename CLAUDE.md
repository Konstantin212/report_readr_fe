# report_readr_fe — Orchestration Playbook

This is the conductor for the Claude Code agent team on this repo. The main
session acts as conductor: it sequences agents per the workflow scenarios
below and agents hand off work through files on disk (AC docs, design docs,
diffs, test reports). **Subagents do not call other subagents** — only the
conductor (this session) dispatches agents.

## 1. Project & stack

German investment-tax reporting app (Freedom Finance / IBKR statement
ingest → event-sourced ledger → Pulse analytics dashboard → Anlage KAP /
KAP-INV / SO export for ELSTER filing).

- **Framework:** Next.js 15 (App Router) / React 19
- **Data:** Drizzle ORM on Neon (serverless Postgres)
- **Auth:** better-auth
- **Testing:** Vitest (unit) + Playwright (e2e)
- **Hosting:** Vercel
- **Package manager:** pnpm (never npm/yarn)

The tax module (`src/lib/tax`, the ledger, Anlage KAP/KAP-INV/SO export) is
held to a **legal-correctness** standard: every line number, rate, and
loss-bucket rule must be verifiable against the BMF law book or the official
ELSTER form — never accepted from memory or an unverified secondary source
(the tax PDF referenced in project docs is secondary to BMF/ELSTER).

## 2. Skill ↔ agent map

| Agent | Skills (MUST invoke) | Reads | Writes / Hands off |
|---|---|---|---|
| `business-analyst` | `business-analysis`, `documentation-standards` | user request, `docs/INDEX.md`, existing `docs/*` | AC doc (Given-When-Then) for `architect` |
| `architect` | `software-architecture` (+ `tax-system`/`gdpr-compliance` when relevant) | AC doc, `docs/INDEX.md`, existing patterns | architecture/design doc |
| `developer` | `nextjs-security`, `nextjs-best-practices`, `react-best-practices` | architecture doc | implementation (TDD) + passing tests |
| `code-reviewer` | `code-review`, `nextjs-security`, `nextjs-best-practices`, `react-best-practices` | the diff | review report (blocking/non-blocking); gate before push |
| `tester` | `qa-testing`, `gdpr-compliance` | implementation + AC | tests, coverage report; may propose test-tooling changes back into `developer` |
| `tax-advisor` | `tax-system`, `ibkr-tax` | financial statements, tax questions, `docs/*` | tax-correctness guidance / Anlage line mapping; flags verification needs |
| `documentation-writer` | `documentation-standards` | `docs/INDEX.md`, changed behavior | updated docs + `docs/INDEX.md` entry + changelog |

Reference-only skills (`tax-system`, `ibkr-tax`, `gdpr-compliance`) are
consulted on demand rather than owned by a single agent.

## 3. Workflow scenarios

**New feature / business logic:**
`business-analyst` (reads `docs/INDEX.md` → writes AC) → `architect`
(design) → `developer` (TDD) → `code-reviewer` (gate) → `tester` (coverage)
→ `documentation-writer` (docs + `docs/INDEX.md` + changelog) → push.

**Tax-logic change** (touches `src/lib/tax`, the ledger, or any Anlage
KAP/KAP-INV/SO code): same as above but insert `tax-advisor` right after
`business-analyst`. Golden-fixture verification in the `tester` step is
**mandatory**. Run a `gdpr-compliance` check if PII is touched. Never accept
tax line numbers, rates, or loss-bucket rules without verifying the cited
BMF source.

**Bug fix:** `systematic-debugging` (skill) → `developer` → `tester` →
`documentation-writer` only if observable behavior changed.

**UI change:** `developer` (guided by `react-best-practices` /
`nextjs-best-practices`) + the existing `.design-sync` flow
(`.design-sync/config.json`, `.design-sync/NOTES.md`).

## 4. Pre-push contract

A versioned git hook (`scripts/git-hooks/pre-push`, wired via
`core.hooksPath`) runs `pnpm typecheck && pnpm lint && pnpm test && pnpm
build` and **must pass** before a push succeeds — see
`scripts/setup-git-hooks.sh` (also run automatically by the `prepare` npm
lifecycle script on `pnpm install`).

Beyond the mechanical gate: **`code-reviewer` and `tester` must have signed
off** before the conductor requests a push. Do not push on an unreviewed or
untested diff even if the hook alone would pass.

## 5. Environment

- Runs inside WSL (Windows Subsystem for Linux) — filesystem, shell, and
  paths are Linux-style; Windows drives are mounted under `/mnt/c/...` when
  needed.
- Commands may be transparently rewritten by the RTK (Rust Token Killer)
  proxy hook for token savings — this is invisible to normal usage.
- Package manager is **pnpm** only (never npm/yarn). Node **>= 24**.
- Next.js security floor is **>= 15.2.3** (CVE-2025-29927,
  `x-middleware-subrequest` bypass); this repo currently pins `^15.1.0` —
  flag this in any `nextjs-security`-relevant work rather than silently
  bumping it.

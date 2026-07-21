# Agent Team & Skills — Design Spec

**Date:** 2026-07-21
**Status:** Approved for planning
**Topic:** A committed Claude Code "team" for report_readr_fe — 11 skills, 7 orchestrated agents, a documentation registry, and a pre-push gate.

## 1. Goal

Turn the loose collection of best-practice sources the maintainer curated into a
**repeatable, orchestrated development workflow** that Claude Code follows on this
project. Concretely:

- Distil the best-practice articles into **skills** that agents actually enforce.
- Keep the tax/GDPR/IBKR authority sources as **consult-on-demand reference skills**
  (they clarify; the BMF law book / official forms remain source of truth).
- Define **7 specialist agents**, each bound to specific skills.
- Wire the agents into **orchestrated workflow scenarios** in a root `CLAUDE.md`
  (the main session is the conductor — subagents do not call each other).
- Give the doc-writer a **single-source-of-truth registry** (`docs/INDEX.md`).
- Add a **deterministic pre-push gate** (typecheck + lint + test + build).

## 2. Orchestration model (decided)

**Model A — orchestration playbook.** The main Claude session is the conductor.
Agents communicate through **files on disk** (AC docs, architecture docs, INDEX,
diffs), never by spawning each other. `CLAUDE.md` encodes the sequences.

## 3. Source handling (decided)

Two classes of source:

- **Enforcement sources** (Next.js security, Next.js clean-code, React, QA,
  software architecture, code review, business analyst) → **distilled into skill
  bodies** as concrete checklists. The URL becomes a footnote. Content was fetched
  and captured during design (2026-07-21).
- **Reference / authority sources** (`2026+TaxGuide.pdf`, kapitaltax IBKR article,
  BDSG/GDPR law text) → **consult-on-demand pointers**: the skill curates *what is
  in the source* and *when to consult it*, and defers to the real authority.

### Known caveats (must appear in the relevant skills)

- **PDF tooling:** this WSL host has no PDF reader (no poppler/pdftotext). Reading
  `2026+TaxGuide.pdf` via the Read tool currently fails. The `tax-system` skill
  records the one-time fix (`sudo apt-get install poppler-utils`) and treats the
  PDF as *secondary* to the BMF law book regardless.
- **Freedom Finance delta:** the kapitaltax article covers Interactive Brokers only
  and makes **no** Freedom Finance comparison. The `ibkr-tax` skill encodes the IBKR
  treatment and marks any Freedom-specific difference as *project knowledge, not from
  this source* (kapitaltax can be used for Freedom "but not precisely").
- **BA acceptance criteria:** the BA source used the plain "As a … I want … so that …"
  story format; this project **standardizes on Given-When-Then** for acceptance
  criteria. Noted in `business-analysis`.

## 4. Skills — `.claude/skills/<name>/SKILL.md`

Project-scoped (committed). Each `SKILL.md` has YAML frontmatter
(`name`, `description`) and a body. Descriptions are written so the model recalls the
skill at the right moment.

### 4.1 Enforcement skills

| Skill | Core content (distilled) |
|---|---|
| `nextjs-security` | Session tokens in `httpOnly`/`Secure`/`SameSite` cookies (never `localStorage`); re-verify auth **in every** Route Handler / Server Action (middleware ≠ security boundary); patch floor for CVE-2025-29927 (`x-middleware-subrequest` bypass) — Next ≥ 15.2.3; Zod `.safeParse` on all server inputs; CSP + `X-Frame-Options: DENY` + `nosniff` + HSTS + `Permissions-Policy` in `next.config.ts`; no secrets in `NEXT_PUBLIC_`; rate-limit login/OTP/reset; sanitize/avoid `dangerouslySetInnerHTML`; validate `returnTo` as relative URL; `npm/pnpm audit`. Source: authgear. |
| `nextjs-best-practices` | Server Components by default, `"use client"` only for interactivity/hooks/browser APIs; directory responsibilities (`app/`, `components/{ui,features,layouts}`, `lib/`, `hooks/`, `services/`, `types/`); service-layer data fetching + explicit caching; `error.tsx`/`loading.tsx`; env validation at boot; naming conventions (PascalCase components, `use*` hooks, UPPER_SNAKE constants); `next/image`, `next/dynamic`; ESLint+Prettier. Source: dev.to (sizan). |
| `react-best-practices` | Functional components + SRP; hooks rules (`useState`/`useEffect`, extract custom hooks); state strategy (local `useState` → Context → Zustand/Redux; no prop drilling); **React Query** for data/caching; memoization (`React.memo`/`useCallback`/`useMemo`) applied deliberately; TS typing; no inline render fns; RTL + Storybook; strip `console` in prod. Note existing gaps (a11y, error boundaries, list keys) are covered by team judgment. Source: medium (raveen). |
| `software-architecture` | Modularity (small independent units, one job each); loose coupling + clear boundaries/interfaces; **modular-monolith default**, peel services later (avoid premature microservices); observability (logs/metrics/traces); shift-left security / DevSecOps; Zero Trust + least privilege; data minimization; abstraction layer around external/AI deps. Applied to *this* stack (Next.js + Drizzle/Neon + Vercel). Source: wondermentapps. |
| `code-review` | Review checklist: correctness first, readability/naming, adequate tests, security, small focused scope, no unrelated refactoring; leave actionable comments; reviewer verifies rather than trusts; blocking vs non-blocking distinction. Source: Palantir. |
| `qa-testing` | 7-stage QA (requirements→plan→design→execute→defects→regression→report→improve); test pyramid; **quality gates** (failed unit blocks commit, failed integration blocks deploy); golden-fixture discipline for tax; map to repo tooling (Vitest unit/integration, Playwright e2e); coverage of critical paths + edge/boundary; defect logging with repro. Source: virtuosoqa. |
| `business-analysis` | Elicit → structured requirements; **read `docs/INDEX.md` first** to reuse existing business logic; write acceptance criteria in **Given-When-Then**; user stories "As a…/I want…/so that…"; traceability (requirement ↔ AC ↔ tests); prioritize; kill ambiguity; scope control; validate drafts early. Source: elyxai. |
| `documentation-standards` | The doc-writer's law: single source of truth under `docs/`; **`docs/INDEX.md` registry** = every business-logic item and architecture entry as **title + 1–2 line description + link**; strict scalable hierarchy; **changelog rules** (what/why/when, link to spec/plan); one concept per file; update INDEX on every doc change; no duplicate/contradictory docs. |

### 4.2 Reference skills (consult-on-demand)

| Skill | Core content |
|---|---|
| `tax-system` | Guidance pointer. **BMF circulars / official forms = source of truth.** `2026+TaxGuide.pdf` at `/mnt/c/Users/Kostan/Downloads/2026+TaxGuide.pdf` = secondary clarification only (with poppler caveat). When a tax question arises: consult INDEX/`docs/*` first, then the law book, then the PDF for plain-language clarification — never treat the PDF as authoritative. Cross-links `ibkr-tax`. |
| `ibkr-tax` | IBKR treatment map for German returns: Anlage KAP / KAP-INV / SO; **no German tax certificate** → derive from Flex XML; **ECB reference rates** for FX applied consistently; FIFO per BMF; Teilfreistellung (§20 InvStG: 30% equity / 15% mixed / 60% RE / 80% foreign RE); Vorabpauschale (§18 InvStG); dividends structured by security/country/withholding; options treated distinctly. **Freedom Finance:** same principles usable "but not precisely" — mark deltas as project knowledge, verify against golden fixtures. Source: kapitaltax. |
| `gdpr-compliance` | BDSG/GDPR checklist for anything touching PII/financial data: lawful basis & purpose limitation (§24); minimize + accuracy (§47); access rights with documented exceptions (§34); **erasure vs. statutory tax-retention** conflict (§35, §47 no.5); consent form/withdrawal (§26); security — encryption/pseudonymization/access-control/audit-logging (§22(2)); staff confidentiality (§52–53); breach notification (Arts 33–34 GDPR); DPO threshold (§38); DPIA trigger for large-volume sensitive finance data. Source: BDSG (gesetze-im-internet). |

## 5. Agents — `.claude/agents/<name>.md`

Project-scoped (committed). Frontmatter: `name`, `description` (when-to-use, third
person), `tools` (least-privilege), `model` (inherit unless a cheaper tier fits).
Every agent body: (a) which skills it lives by and MUST invoke, (b) the input
artifact it reads, (c) the output artifact it writes, (d) hard rules.

| Agent | Skills (must invoke) | Reads | Writes / Hands off | Tools |
|---|---|---|---|---|
| `business-analyst` | business-analysis, documentation-standards | user request, `docs/INDEX.md`, existing `docs/*` | AC doc (Given-When-Then) for architect; requests doc updates from documentation-writer | Read, Grep, Glob, Write |
| `architect` | software-architecture (+ tax-system/gdpr on relevant work) | AC doc, `docs/INDEX.md`, existing patterns | architecture/design doc; notes new tech-stack integration | Read, Grep, Glob, Write |
| `developer` | nextjs-security, nextjs-best-practices, react-best-practices | architecture doc | implementation (TDD) + passing tests | Read, Edit, Write, Bash, Grep, Glob |
| `code-reviewer` | code-review, nextjs-security, nextjs-best-practices, react-best-practices | the diff | review report (blocking/non-blocking); gate before push | Read, Grep, Glob, Bash (read-only) |
| `tester` | qa-testing, gdpr-compliance | implementation + AC | tests, coverage report; **proposes test-tooling** and folds accepted approaches back into `developer` agent; runs on pre-push | Read, Edit, Write, Bash, Grep, Glob |
| `tax-advisor` | tax-system, ibkr-tax | financial statements, tax questions, `docs/*` | tax-correctness guidance / mapping to Anlage lines; flags verification needs | Read, Grep, Glob, WebFetch |
| `documentation-writer` | documentation-standards | `docs/INDEX.md`, changed behavior | updated docs + INDEX entry + changelog | Read, Edit, Write, Grep, Glob |

Notes:
- `code-reviewer` is a **separate** agent (independent pass), not just a
  developer self-check.
- `tester` may **modify the `developer` agent definition** to institutionalize new
  testing approaches — an explicit, allowed feedback loop.
- `tax-advisor` is first-class given the domain; consulted on any `src/lib/tax`,
  ledger, or Anlage-KAP work.

## 6. Orchestration — root `CLAUDE.md`

New root `CLAUDE.md` (none exists today). Sections:

1. **Project one-liner + stack** (Next.js 15 / React 19, Drizzle/Neon, better-auth,
   Vitest/Playwright, Vercel; tax module held to legal-correctness).
2. **Skill ↔ agent map** (the table from §5).
3. **Workflow scenarios** (the conductor follows these):
   - **New feature / business logic:** `business-analyst` (read INDEX → AC) →
     `architect` (design) → `developer` (TDD) → `code-reviewer` (gate) →
     `tester` (coverage) → `documentation-writer` (docs + INDEX + changelog) → push.
   - **Tax-logic change** (`src/lib/tax`, ledger, Anlage): add `tax-advisor` after
     BA; **mandatory** golden-fixture verification in the tester step; `gdpr-compliance`
     check if PII touched. Never accept line numbers/rates/bucket rules without
     verifying against the cited BMF source.
   - **Bug fix:** systematic-debugging → `developer` → `tester` → docs if behavior changed.
   - **UI change:** `developer` (react/nextjs skills) + existing `.design-sync` flow.
4. **Pre-push contract:** deterministic hook (typecheck+lint+test+build) MUST pass;
   `code-reviewer` + `tester` MUST have signed off before a push is requested.
5. **Environment notes:** WSL paths, RTK proxy, `pnpm` (not npm/yarn), Node ≥ 24.

## 7. Documentation registry — `docs/INDEX.md`

Single source of truth index the BA/architect read first. Structure:

```
# Documentation Index

## Business Logic
- **<Title>** — 1–2 line description. → [doc](relative/path.md)

## Architecture
- **<Title>** — 1–2 line description. → [doc](relative/path.md)

## Specs & Plans
- **<Title>** — status + 1 line. → [spec](superpowers/specs/…)
```

**Seeded** from existing docs: `elster-anlage-kap-2025-gaps.md`,
`vorabpauschale-design.md`, and the four `superpowers/specs/*` + three
`superpowers/plans/*`. Every future doc change updates INDEX (enforced by
`documentation-standards`).

## 8. Pre-push gate

Two layers:

- **Deterministic git hook** — `.husky/pre-push` (husky) or a plain
  `.git/hooks/pre-push` script committed via a repo `scripts/` file, running:
  `pnpm typecheck && pnpm lint && pnpm test && pnpm build`. Non-zero blocks push.
  (Decision: include **build**.)
- **CLAUDE.md rule** — before requesting a push, `code-reviewer` and `tester` must
  have signed off (§6.4).

Husky vs raw hook: prefer **husky** so the hook is versioned and installed via a
`prepare` script; fall back to a committed `scripts/pre-push.sh` symlinked into
`.git/hooks` if husky is unwanted. Finalize in the plan.

## 9. Out of scope (YAGNI)

- No CI/CD workflow changes beyond the local pre-push gate (GitHub Actions can adopt
  the same `pnpm` chain later).
- No new runtime dependencies for the app itself.
- No rewrite of existing `docs/*`; only INDEX seeding + going-forward standards.

## 10. Implementation phases (for the plan)

1. **Skills** (11 `SKILL.md` files) — enforcement first, then reference.
2. **Docs registry** — create + seed `docs/INDEX.md`.
3. **Agents** (7 `.md` files) bound to skills.
4. **Root `CLAUDE.md`** — map + scenarios + contracts.
5. **Pre-push gate** — husky/script + `pnpm build` verified to run.
6. **Verification** — dry-run one scenario (e.g., a trivial feature) end-to-end;
   confirm hook fires; confirm INDEX links resolve.

## 11. Sources (footnotes for skills)

- Next.js security — authgear.com/post/nextjs-security-best-practices
- Next.js best practices — dev.to/…/nextjs-clean-code-best-practices-for-scalable-applications
- React best practices — medium.com/@raveenpanditha/mastering-react-best-practices
- Tax guide (reference) — `C:\Users\Kostan\Downloads\2026+TaxGuide.pdf`
- IBKR tax — kapitaltax.de/en/interactive-brokers-tax-return
- QA — virtuosoqa.com/post/software-qa-process
- GDPR/BDSG — gesetze-im-internet.de/englisch_bdsg
- Software architecture — wondermentapps.com/blog/software-architecture-best-practices
- Code review — blog.palantir.com/code-review-best-practices
- Business analyst — getelyxai.com/en/blog/business-analyst-best-practices

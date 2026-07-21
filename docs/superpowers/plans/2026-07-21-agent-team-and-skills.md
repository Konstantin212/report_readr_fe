# Agent Team & Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install a committed Claude Code "team" for report_readr_fe — 11 project skills, 7 orchestrated agents, a `docs/INDEX.md` registry, a root `CLAUDE.md` conductor, and a deterministic pre-push gate.

**Architecture:** Skills live in `.claude/skills/<name>/SKILL.md` (enforcement + reference). Agents live in `.claude/agents/<name>.md`, each bound to skills, communicating only through files on disk. The root `CLAUDE.md` is the conductor that sequences agents into workflow scenarios. A git hook (`core.hooksPath`) runs `pnpm typecheck && pnpm lint && pnpm test && pnpm build` before every push.

**Tech Stack:** Markdown + YAML frontmatter (skills/agents), a POSIX shell hook script, `git config core.hooksPath`, pnpm. No new app runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-07-21-agent-team-and-skills-design.md` — the distilled source content for every skill body lives in spec §4. Read it alongside this plan.

## Global Constraints

- Skill files: `.claude/skills/<kebab-name>/SKILL.md` with frontmatter `name` (kebab, matches dir) + `description` (one line, written so the model recalls it at the right moment). Committed to the repo.
- Agent files: `.claude/agents/<kebab-name>.md` with frontmatter `name`, `description` (third-person, when-to-use), `tools` (least-privilege comma list), `model: inherit`. Committed.
- Package manager is **pnpm** (never npm/yarn). Node ≥ 24.
- Next.js security floor: **≥ 15.2.3** (CVE-2025-29927). Current repo is `^15.1.0` — flag, do not silently bump.
- Reference skills defer to authority: BMF law book / official ELSTER forms are source of truth; the tax PDF is secondary.
- PDF path (WSL): `/mnt/c/Users/Kostan/Downloads/2026+TaxGuide.pdf`. Reading PDFs needs `poppler-utils` (not installed) — record the caveat, don't block.
- Freedom Finance tax specifics are **project knowledge**, not from the kapitaltax source.
- Acceptance criteria standard: **Given-When-Then**.
- Every commit message ends with the Co-Authored-By trailer per repo convention.
- Verification for content files = frontmatter parses + file exists + internal links resolve (there are no unit tests for Markdown).

---

## Phase 1 — Skills

Each skill is its own task (a reviewer can accept one and reject another). For every skill: create the directory + `SKILL.md`, then verify frontmatter. The **body content** for each is the distilled checklist in spec §4 — write it as clear Markdown headings + bullets. Below, each task names the file, the exact frontmatter, and the required body sections.

### Task 1: `nextjs-security` skill

**Files:**
- Create: `.claude/skills/nextjs-security/SKILL.md`

- [ ] **Step 1: Write the file** with frontmatter:

```markdown
---
name: nextjs-security
description: Use when writing or reviewing any Next.js server code — Route Handlers, Server Actions, middleware, auth, cookies, env vars, or headers. Enforces the project's Next.js security checklist.
---
```

Body sections (from spec §4.1):
- **Auth & sessions:** session tokens in `httpOnly` + `Secure` + `SameSite=Lax` cookies via `cookies()` from `next/headers`; never `localStorage`; session timeout ≤ 24h, rotate on privilege change.
- **Authorization:** re-verify auth **inside every** Route Handler / Server Action (`401` no session, `403` role mismatch). Middleware is edge routing, **not** a security boundary — protect admin routes in both.
- **CVE-2025-29927:** patch floor Next ≥ 15.2.3; the `x-middleware-subrequest` header bypass. Repo is `^15.1.0` — call it out.
- **Input validation:** Zod `.safeParse` on all `formData`/body server-side; client validation is UX only.
- **Headers in `next.config.ts`:** CSP (`default-src 'self'`, scoped `script-src`/`connect-src`, `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic/geo off), HSTS.
- **Secrets:** never in `NEXT_PUBLIC_`; `.env*` gitignored; use Vercel env.
- **Misc:** rate-limit login/OTP/reset; sanitize/avoid `dangerouslySetInnerHTML` (isomorphic-dompurify); validate `returnTo` as relative URL; `pnpm audit`.
- **Source:** authgear.com/post/nextjs-security-best-practices (footnote).

- [ ] **Step 2: Verify** — Run: `head -5 .claude/skills/nextjs-security/SKILL.md` → shows valid `name`/`description` frontmatter.
- [ ] **Step 3: Commit** — `git add .claude/skills/nextjs-security && git commit -m "feat(skills): add nextjs-security skill"`

### Task 2: `nextjs-best-practices` skill

**Files:** Create `.claude/skills/nextjs-best-practices/SKILL.md`

- [ ] **Step 1: Write the file** with frontmatter:

```markdown
---
name: nextjs-best-practices
description: Use when structuring Next.js App Router code — deciding Server vs Client Components, data fetching, folder layout, error/loading states, env access, or naming. Enforces clean-code conventions.
---
```

Body (spec §4.1): Server Components by default, `"use client"` only for interactivity/hooks/browser APIs; directory responsibilities (`app/`, `components/{ui,features,layouts}`, `lib/`, `hooks/`, `services/`, `types/`); service-layer data fetching + explicit caching (`no-store`/`force-cache`/`revalidate`); `error.tsx`/`loading.tsx`; validate env at boot, centralize in a config module; naming (PascalCase components, `use*` hooks, camelCase utils, UPPER_SNAKE constants, PascalCase types); `next/image`, `next/dynamic`; ESLint (`next/core-web-vitals`) + Prettier; keep components < ~200 lines. Source: dev.to (sizan).

- [ ] **Step 2: Verify** — `head -5` shows frontmatter.
- [ ] **Step 3: Commit** — `feat(skills): add nextjs-best-practices skill`

### Task 3: `react-best-practices` skill

**Files:** Create `.claude/skills/react-best-practices/SKILL.md`

- [ ] **Step 1: Write the file** with frontmatter:

```markdown
---
name: react-best-practices
description: Use when writing or reviewing React components and hooks — component design, state management, data fetching, memoization, or TypeScript typing in .tsx files.
---
```

Body (spec §4.1): functional components + Single Responsibility; hooks rules (`useState`/`useEffect`, extract custom hooks); state strategy (local `useState` → Context → Zustand/Redux; avoid prop drilling); **React Query** for data/caching (already a dependency); deliberate memoization (`React.memo`/`useCallback`/`useMemo` — not by reflex); TS typing over PropTypes; no inline functions in render; RTL + Storybook for isolation; strip `console` in prod. Team-judgment note: a11y, error boundaries, and list-key correctness aren't in the source article — apply anyway. Source: medium (raveen).

- [ ] **Step 2: Verify** — `head -5`.
- [ ] **Step 3: Commit** — `feat(skills): add react-best-practices skill`

### Task 4: `software-architecture` skill

**Files:** Create `.claude/skills/software-architecture/SKILL.md`

- [ ] **Step 1: Write the file** with frontmatter:

```markdown
---
name: software-architecture
description: Use when designing system structure — module boundaries, coupling/cohesion, scalability, observability, or introducing/integrating a new part of the tech stack.
---
```

Body (spec §4.1): modularity (small independent single-job units); loose coupling + explicit interfaces; **modular-monolith default** for this app, peel out services only when justified (no premature microservices); observability (logs/metrics/traces); shift-left security / DevSecOps; Zero Trust + least privilege; data minimization; put an abstraction layer around external/broker/market-data/AI dependencies. Applied to this stack: Next.js 15 + Drizzle/Neon + better-auth + Vercel. Source: wondermentapps.

- [ ] **Step 2: Verify** — `head -5`.
- [ ] **Step 3: Commit** — `feat(skills): add software-architecture skill`

### Task 5: `code-review` skill

**Files:** Create `.claude/skills/code-review/SKILL.md`

- [ ] **Step 1: Write the file** with frontmatter:

```markdown
---
name: code-review
description: Use when reviewing a diff before it merges or pushes — checking correctness, readability, test adequacy, security, and scope.
---
```

Body (spec §4.1, Palantir): review priority order — correctness first, then readability/naming, test adequacy, security, and tight scope (reject unrelated refactoring); leave actionable comments; the reviewer verifies claims rather than trusting them; mark each comment blocking vs non-blocking; approve only when blocking issues are resolved. Source: blog.palantir.com/code-review-best-practices.

- [ ] **Step 2: Verify** — `head -5`.
- [ ] **Step 3: Commit** — `feat(skills): add code-review skill`

### Task 6: `qa-testing` skill

**Files:** Create `.claude/skills/qa-testing/SKILL.md`

- [ ] **Step 1: Write the file** with frontmatter:

```markdown
---
name: qa-testing
description: Use when planning or writing tests, defining coverage, or gating quality — unit/integration/e2e/regression, quality gates, and golden-fixture verification.
---
```

Body (spec §4.1, virtuosoqa): 7-stage QA (requirements → plan → design → execute → defects → regression → report → improve); test pyramid; **quality gates** (failing unit blocks commit, failing integration blocks deploy); repo mapping — Vitest (`pnpm test`) for unit/integration, Playwright (`pnpm test:e2e`) for e2e; **golden-fixture discipline** for the tax module (compare against ELSTER-verified fixtures); cover critical paths + edge/boundary; log defects with repro steps. Source: virtuosoqa.com/post/software-qa-process.

- [ ] **Step 2: Verify** — `head -5`.
- [ ] **Step 3: Commit** — `feat(skills): add qa-testing skill`

### Task 7: `business-analysis` skill

**Files:** Create `.claude/skills/business-analysis/SKILL.md`

- [ ] **Step 1: Write the file** with frontmatter:

```markdown
---
name: business-analysis
description: Use when turning a user request into acceptance criteria — eliciting requirements, checking docs/INDEX.md for existing logic, and writing Given-When-Then criteria for the architect.
---
```

Body (spec §4.1, elyxai): **read `docs/INDEX.md` first** to find/reuse existing business logic; elicit → structured requirements; write acceptance criteria in **Given-When-Then** (upgrade from the source's plain "As a…" story format); user stories "As a…/I want…/so that…"; traceability (requirement ↔ AC ↔ tests); prioritize; eliminate ambiguity; hold scope; validate drafts early. Source: getelyxai.com/en/blog/business-analyst-best-practices.

- [ ] **Step 2: Verify** — `head -5`.
- [ ] **Step 3: Commit** — `feat(skills): add business-analysis skill`

### Task 8: `documentation-standards` skill

**Files:** Create `.claude/skills/documentation-standards/SKILL.md`

- [ ] **Step 1: Write the file** with frontmatter:

```markdown
---
name: documentation-standards
description: Use when creating or updating any doc under docs/ — enforces the single-source-of-truth hierarchy, the docs/INDEX.md registry, changelog rules, and one-concept-per-file.
---
```

Body (spec §4.1): single source of truth under `docs/`; **`docs/INDEX.md` registry** lists every business-logic item and architecture entry as **title + 1–2 line description + link**; strict scalable hierarchy; **changelog rules** — each doc change records what/why/when and links its spec/plan; one concept per file; **update INDEX on every doc add/change/remove**; never leave duplicate or contradictory docs; prefer editing an existing doc over creating a near-duplicate.

- [ ] **Step 2: Verify** — `head -5`.
- [ ] **Step 3: Commit** — `feat(skills): add documentation-standards skill`

### Task 9: `tax-system` skill (reference)

**Files:** Create `.claude/skills/tax-system/SKILL.md`

- [ ] **Step 1: Write the file** with frontmatter:

```markdown
---
name: tax-system
description: Consult when a German investment-tax question needs clarification — points to authoritative sources in priority order and explains when to use the 2026 tax guide PDF.
---
```

Body (spec §4.2, §3 caveats): **authority order** — (1) `docs/INDEX.md` + `docs/*` project docs, (2) BMF circulars / official ELSTER forms (source of truth), (3) `2026+TaxGuide.pdf` at `/mnt/c/Users/Kostan/Downloads/2026+TaxGuide.pdf` for plain-language clarification **only**, never authoritative. **PDF caveat:** reading it needs `poppler-utils` (`sudo apt-get install poppler-utils`), not currently installed. Cross-links `[[ibkr-tax]]`. Never accept line numbers / rates (Basiszins, Teilfreistellung %) / loss-bucket rules from the PDF without verifying against BMF.

- [ ] **Step 2: Verify** — `head -5`.
- [ ] **Step 3: Commit** — `feat(skills): add tax-system reference skill`

### Task 10: `ibkr-tax` skill (reference)

**Files:** Create `.claude/skills/ibkr-tax/SKILL.md`

- [ ] **Step 1: Write the file** with frontmatter:

```markdown
---
name: ibkr-tax
description: Consult when mapping Interactive Brokers (or, less precisely, Freedom Finance) statements to German tax forms — FIFO, FX, withholding, Teilfreistellung, Vorabpauschale.
---
```

Body (spec §4.2, kapitaltax): forms Anlage KAP / KAP-INV / SO; **IBKR gives no German tax certificate** → derive from **Flex XML**; **ECB reference rates** for FX, applied consistently across buys/sells/dividends; **FIFO** per BMF; **Teilfreistellung §20 InvStG** (30% equity / 15% mixed / 60% real-estate / 80% foreign real-estate funds); **Vorabpauschale §18 InvStG**; structure dividends by security/country/withholding, credit foreign tax only per DBA; options treated distinctly (Stillhalterprämien etc.). **Freedom Finance:** same principles apply "but not precisely" — treat any Freedom delta as **project knowledge**, verify against golden fixtures. Cross-links `[[tax-system]]`. Source: kapitaltax.de/en/interactive-brokers-tax-return.

- [ ] **Step 2: Verify** — `head -5`.
- [ ] **Step 3: Commit** — `feat(skills): add ibkr-tax reference skill`

### Task 11: `gdpr-compliance` skill (reference)

**Files:** Create `.claude/skills/gdpr-compliance/SKILL.md`

- [ ] **Step 1: Write the file** with frontmatter:

```markdown
---
name: gdpr-compliance
description: Consult when handling PII or financial data — storage, retention, deletion, consent, access requests, logging, or encryption. Checklist against BDSG/GDPR.
---
```

Body (spec §4.2, BDSG): lawful basis & purpose limitation (§24); minimize + accuracy (§47); access with documented exceptions (§34); **erasure vs. statutory tax-retention** conflict (§35, §47 no.5) — deletion requests must reconcile against mandatory tax-record retention; consent form + withdrawal (§26); security — encryption / pseudonymization / access-control / audit-logging (§22(2)); staff confidentiality (§52–53); breach notification (Arts 33–34 GDPR); **DPO threshold** (§38); DPIA trigger for large-volume sensitive financial data. Source: gesetze-im-internet.de/englisch_bdsg.

- [ ] **Step 2: Verify** — `head -5`.
- [ ] **Step 3: Commit** — `feat(skills): add gdpr-compliance reference skill`

### Task 12: Skills sanity gate

**Files:** none (verification only)

- [ ] **Step 1: Verify all 11 exist** — Run: `ls .claude/skills/` → expect 11 dirs. Run: `for f in .claude/skills/*/SKILL.md; do head -1 "$f" | grep -q '^---' || echo "BAD FRONTMATTER: $f"; done` → no output.
- [ ] **Step 2: Verify names match dirs** — Run: `for d in .claude/skills/*/; do n=$(basename "$d"); grep -q "^name: $n$" "$d/SKILL.md" || echo "NAME MISMATCH: $d"; done` → no output.

---

## Phase 2 — Documentation registry

### Task 13: Seed `docs/INDEX.md`

**Files:**
- Create: `docs/INDEX.md`

**Interfaces:**
- Produces: `docs/INDEX.md` — the registry the `business-analyst` and `architect` agents read first.

- [ ] **Step 1: Enumerate existing docs** — Run: `find docs -name '*.md' -not -path '*/plans/*' | sort` and `ls docs/superpowers/plans/`. Read each top-level doc's first heading + purpose so descriptions are accurate.
- [ ] **Step 2: Write `docs/INDEX.md`** with this structure (fill Business Logic / Architecture from `elster-anlage-kap-2025-gaps.md`, `vorabpauschale-design.md`; Specs & Plans from `superpowers/specs/*` + `superpowers/plans/*`, each with real 1-line status):

```markdown
# Documentation Index

Single source of truth for what's documented in this repo. Agents (business-analyst, architect) read this FIRST. Every doc change updates this file (see the `documentation-standards` skill).

## Business Logic
- **<Title>** — <1–2 line description>. → [doc](relative/path.md)

## Architecture
- **<Title>** — <1–2 line description>. → [doc](relative/path.md)

## Specs & Plans
- **<Title>** — <status> — <1 line>. → [spec](superpowers/specs/…)
```

- [ ] **Step 3: Verify links resolve** — Run: `grep -oE '\]\(([^)]+\.md)\)' docs/INDEX.md | sed -E 's/\]\(|\)//g' | while read p; do [ -f "docs/$p" ] || [ -f "$p" ] || echo "BROKEN: $p"; done` → no output.
- [ ] **Step 4: Commit** — `docs: seed docs/INDEX.md documentation registry`

---

## Phase 3 — Agents

Each agent is its own task. Body template every agent follows: **Role** (one paragraph) · **Skills you MUST invoke** (list) · **Input you read** · **Output you produce / hand off** · **Hard rules**. Use least-privilege `tools`.

### Task 14: `business-analyst` agent

**Files:** Create `.claude/agents/business-analyst.md`

- [ ] **Step 1: Write the file:**

```markdown
---
name: business-analyst
description: Use at the start of a new feature or business-logic change to turn a user request into acceptance criteria. Reads docs/INDEX.md first to reuse existing logic, then writes Given-When-Then AC for the architect.
tools: Read, Grep, Glob, Write
model: inherit
---
```

Body: Role — translate user intent into unambiguous AC. **Skills you MUST invoke:** `business-analysis`, `documentation-standards`. **Read:** the user request, `docs/INDEX.md`, then any linked existing docs. **Produce:** an AC document (Given-When-Then) ready for the `architect`; request doc updates from `documentation-writer` when logic is new/changed. **Hard rules:** always read `docs/INDEX.md` before drafting; reuse existing business logic rather than duplicating; kill ambiguity; keep scope tight.

- [ ] **Step 2: Verify** — `head -6 .claude/agents/business-analyst.md` shows all frontmatter keys.
- [ ] **Step 3: Commit** — `feat(agents): add business-analyst agent`

### Task 15: `architect` agent

**Files:** Create `.claude/agents/architect.md`

- [ ] **Step 1: Write the file:**

```markdown
---
name: architect
description: Use after acceptance criteria exist to design the technical approach. Reads docs/INDEX.md and existing patterns, produces a design blueprint, and documents new/updated architecture and any new tech-stack integration.
tools: Read, Grep, Glob, Write
model: inherit
---
```

Body: Role — own technical architecture; design scalable systems on the current stack (Next.js 15 / React 19 / Drizzle-Neon / better-auth / Vercel) and define integration when introducing new tech. **Skills you MUST invoke:** `software-architecture` (plus `tax-system` / `gdpr-compliance` when the work touches tax or PII). **Read:** the AC doc, `docs/INDEX.md`, existing design patterns in `docs/*`. **Produce:** an architecture/design doc; note new-tech integration and any modified design patterns. **Hard rules:** read `docs/INDEX.md` first; follow existing patterns unless there's a documented reason to change them; keep boundaries explicit.

- [ ] **Step 2: Verify** — `head -6`.
- [ ] **Step 3: Commit** — `feat(agents): add architect agent`

### Task 16: `developer` agent

**Files:** Create `.claude/agents/developer.md`

- [ ] **Step 1: Write the file:**

```markdown
---
name: developer
description: Use to implement a feature or fix from an architecture doc. Writes code test-first, following the project's Next.js security, Next.js best-practices, and React best-practices skills.
tools: Read, Edit, Write, Bash, Grep, Glob
model: inherit
---
```

Body: Role — responsible for code development. **Skills you MUST invoke:** `nextjs-security`, `nextjs-best-practices`, `react-best-practices`. **Read:** the architecture doc. **Produce:** implementation with passing tests (TDD). **Hard rules:** test-first; obey the three skills' checklists before considering work done; do not push (that's gated by `code-reviewer` + `tester`); flag if the Next.js version is below the 15.2.3 security floor.

- [ ] **Step 2: Verify** — `head -6`.
- [ ] **Step 3: Commit** — `feat(agents): add developer agent`

### Task 17: `code-reviewer` agent

**Files:** Create `.claude/agents/code-reviewer.md`

- [ ] **Step 1: Write the file:**

```markdown
---
name: code-reviewer
description: Use to independently review a diff before it is pushed. Applies the code-review, Next.js security, Next.js best-practices, and React best-practices skills and gates the push.
tools: Read, Grep, Glob, Bash
model: inherit
---
```

Body: Role — independent review before push (not the developer's self-check). **Skills you MUST invoke:** `code-review`, `nextjs-security`, `nextjs-best-practices`, `react-best-practices`. **Read:** the diff (`git diff`). **Produce:** a review report with blocking vs non-blocking findings; gate the push. **Hard rules:** correctness first; verify, don't trust; approve only when blocking issues are resolved; use Bash read-only (`git diff`, `git log`) — no edits.

- [ ] **Step 2: Verify** — `head -6`.
- [ ] **Step 3: Commit** — `feat(agents): add code-reviewer agent`

### Task 18: `tester` agent

**Files:** Create `.claude/agents/tester.md`

- [ ] **Step 1: Write the file:**

```markdown
---
name: tester
description: Use to verify coverage of all cases before a push and on the pre-push hook. Follows the qa-testing and gdpr-compliance skills, and may propose/integrate new test tooling into the developer agent.
tools: Read, Edit, Write, Bash, Grep, Glob
model: inherit
---
```

Body: Role — verify the app covers all reasonable cases to avoid errors; run on pre-push. **Skills you MUST invoke:** `qa-testing`, `gdpr-compliance`. **Read:** the implementation + AC. **Produce:** tests and a coverage report; when a new test approach/tool is warranted, propose it and, once accepted, **fold it back into `.claude/agents/developer.md`** so developers adopt it. **Hard rules:** golden-fixture verification is mandatory for `src/lib/tax` changes; run `pnpm test` and `pnpm test:e2e`; GDPR check when PII is touched.

- [ ] **Step 2: Verify** — `head -6`.
- [ ] **Step 3: Commit** — `feat(agents): add tester agent`

### Task 19: `tax-advisor` agent

**Files:** Create `.claude/agents/tax-advisor.md`

- [ ] **Step 1: Write the file:**

```markdown
---
name: tax-advisor
description: Use for any German investment-tax question or when mapping broker financial statements to the correct tax principles and Anlage KAP/KAP-INV/SO lines. Follows the tax-system and ibkr-tax skills.
tools: Read, Grep, Glob, WebFetch
model: inherit
---
```

Body: Role — connect financial statements to correct tax principles. **Skills you MUST invoke:** `tax-system`, `ibkr-tax`. **Read:** financial statements, the tax question, `docs/*`. **Produce:** tax-correctness guidance and mapping to Anlage lines; flag where BMF/ELSTER verification is required. **Hard rules:** BMF/official forms are source of truth, the PDF is only clarification; never assert line numbers/rates/bucket rules without a cited source; mark Freedom Finance specifics as project knowledge to verify against golden fixtures.

- [ ] **Step 2: Verify** — `head -6`.
- [ ] **Step 3: Commit** — `feat(agents): add tax-advisor agent`

### Task 20: `documentation-writer` agent

**Files:** Create `.claude/agents/documentation-writer.md`

- [ ] **Step 1: Write the file:**

```markdown
---
name: documentation-writer
description: Use to create or update documentation after new/changed business logic or architecture. Maintains the single-source-of-truth hierarchy, the docs/INDEX.md registry, and changelog rules.
tools: Read, Edit, Write, Grep, Glob
model: inherit
---
```

Body: Role — standardized documentation with a strict scalable hierarchy. **Skills you MUST invoke:** `documentation-standards`. **Read:** `docs/INDEX.md`, the changed behavior. **Produce:** updated/created docs + a matching **INDEX entry** (title + 1–2 line description + link) + a changelog note. **Hard rules:** single source of truth — prefer editing an existing doc over a near-duplicate; one concept per file; **always update `docs/INDEX.md`**; record what/why/when and link the spec/plan.

- [ ] **Step 2: Verify** — `head -6`.
- [ ] **Step 3: Commit** — `feat(agents): add documentation-writer agent`

### Task 21: Agents sanity gate

- [ ] **Step 1: Verify all 7 exist** — Run: `ls .claude/agents/*.md | wc -l` → `7`. Run: `for f in .claude/agents/*.md; do grep -q '^tools:' "$f" && grep -q '^description:' "$f" || echo "BAD: $f"; done` → no output.
- [ ] **Step 2: Verify skill references are real** — Run: `grep -rhoE '\b(nextjs-security|nextjs-best-practices|react-best-practices|software-architecture|code-review|qa-testing|business-analysis|documentation-standards|tax-system|ibkr-tax|gdpr-compliance)\b' .claude/agents/ | sort -u` and confirm every name printed has a matching `.claude/skills/<name>/`.

---

## Phase 4 — Orchestration

### Task 22: Root `CLAUDE.md`

**Files:** Create `CLAUDE.md` (repo root — none exists today)

**Interfaces:**
- Consumes: all 7 agent names, all 11 skill names, `docs/INDEX.md`.

- [ ] **Step 1: Write `CLAUDE.md`** with these sections (content from spec §6):
  1. **Project & stack** — German investment-tax reporting app; Next.js 15 / React 19 / Drizzle-Neon / better-auth / Vitest+Playwright / Vercel; tax module held to legal-correctness (BMF/ELSTER-verified).
  2. **Skill ↔ agent map** — the table from the spec (agent → skills it must invoke).
  3. **Workflow scenarios** (the main session is the conductor; agents hand off via files):
     - **New feature / business logic:** `business-analyst` (read INDEX → AC) → `architect` (design) → `developer` (TDD) → `code-reviewer` (gate) → `tester` (coverage) → `documentation-writer` (docs + INDEX + changelog) → push.
     - **Tax-logic change** (`src/lib/tax`, ledger, Anlage): insert `tax-advisor` after `business-analyst`; **mandatory** golden-fixture verification in the `tester` step; `gdpr-compliance` check if PII is touched; never accept tax line numbers/rates/bucket rules without verifying the cited BMF source.
     - **Bug fix:** systematic-debugging → `developer` → `tester` → `documentation-writer` if behavior changed.
     - **UI change:** `developer` (react/nextjs skills) + the existing `.design-sync` flow.
  4. **Pre-push contract:** the git hook (typecheck + lint + test + build) MUST pass; `code-reviewer` and `tester` MUST have signed off before a push is requested.
  5. **Environment:** WSL Linux paths; RTK proxy (hook-rewritten commands); **pnpm** only; Node ≥ 24; Next.js security floor 15.2.3.
- [ ] **Step 2: Verify** — Run: `grep -cE 'business-analyst|architect|developer|code-reviewer|tester|tax-advisor|documentation-writer' CLAUDE.md` → ≥ 7; confirm all four scenarios are present.
- [ ] **Step 3: Commit** — `docs: add root CLAUDE.md agent-orchestration playbook`

---

## Phase 5 — Pre-push gate

### Task 23: Committed pre-push hook via `core.hooksPath`

**Files:**
- Create: `scripts/git-hooks/pre-push`
- Create: `scripts/setup-git-hooks.sh`
- Modify: `package.json` (add `prepare` script)

**Interfaces:**
- Produces: a versioned pre-push hook enforcing `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

- [ ] **Step 1: Write `scripts/git-hooks/pre-push`:**

```sh
#!/bin/sh
# Pre-push gate: block push if any check fails.
set -e
echo "▶ pre-push: typecheck"
pnpm typecheck
echo "▶ pre-push: lint"
pnpm lint
echo "▶ pre-push: test"
pnpm test
echo "▶ pre-push: build"
pnpm build
echo "✓ pre-push checks passed"
```

- [ ] **Step 2: Write `scripts/setup-git-hooks.sh`:**

```sh
#!/bin/sh
# Point git at the versioned hooks dir and make hooks executable.
git config core.hooksPath scripts/git-hooks
chmod +x scripts/git-hooks/* 2>/dev/null || true
echo "✓ git hooks configured (core.hooksPath=scripts/git-hooks)"
```

- [ ] **Step 3: Make both executable** — Run: `chmod +x scripts/git-hooks/pre-push scripts/setup-git-hooks.sh`.
- [ ] **Step 4: Add `prepare` script to `package.json`** — add to `scripts`: `"prepare": "sh scripts/setup-git-hooks.sh"` (so `pnpm install` wires it up). Keep JSON valid.
- [ ] **Step 5: Wire it now** — Run: `sh scripts/setup-git-hooks.sh` then verify: `git config --get core.hooksPath` → `scripts/git-hooks`.
- [ ] **Step 6: Prove the hook runs (without a real push)** — Run: `sh scripts/git-hooks/pre-push` and confirm it executes the four steps. (If `pnpm build` is slow/needs env, note it; the gate is still correct. Do not weaken the hook.)
- [ ] **Step 7: Commit** — `chore: add versioned pre-push hook (typecheck+lint+test+build)`

---

## Phase 6 — Verification

### Task 24: End-to-end sanity

**Files:** none

- [ ] **Step 1: Structure check** — Run: `ls .claude/skills/ | wc -l` → 11; `ls .claude/agents/*.md | wc -l` → 7; confirm `CLAUDE.md`, `docs/INDEX.md`, `scripts/git-hooks/pre-push` all exist.
- [ ] **Step 2: Cross-reference check** — every skill named in any agent resolves to a `.claude/skills/<name>/` dir (rerun Task 21 Step 2); every doc linked in `docs/INDEX.md` resolves (rerun Task 13 Step 3).
- [ ] **Step 3: Hook check** — `git config --get core.hooksPath` → `scripts/git-hooks`; `pre-push` is executable (`test -x scripts/git-hooks/pre-push`).
- [ ] **Step 4: Report** — summarize what was created; note the two known caveats to surface to the user (PDF needs `poppler-utils`; repo Next.js `^15.1.0` is below the 15.2.3 security floor).

---

## Self-Review

**Spec coverage:** §4 skills → Tasks 1–11; §5 agents → Tasks 14–20; §6 CLAUDE.md → Task 22; §7 INDEX → Task 13; §8 pre-push → Task 23; §3 caveats → carried into tax-system/ibkr-tax skills (Tasks 9–10) and final report (Task 24). All covered.

**Placeholder scan:** `<Title>` / `<1–2 line description>` in Tasks 13 & 22 are template shapes to be filled from real docs in the same step (enumerated in Task 13 Step 1) — not deferred work. No TODO/TBD.

**Type consistency:** skill names are used identically in frontmatter, agent bodies, and the Task 21/24 grep checks (11 canonical kebab names). Hook path `scripts/git-hooks` is consistent across Task 23 and Task 24.

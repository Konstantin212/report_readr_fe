# Documentation Index

Single source of truth for what's documented in this repo. Agents (business-analyst, architect) read this FIRST. Every doc change updates this file (see the `documentation-standards` skill).

## Business Logic
- **Anlage KAP 2025 — gaps found while filing against the real ELSTER form** — Running record of discrepancies found by comparing Folio's generated KAP draft against the real ELSTER form, field-by-field; open items marked VERIFIED or SUSPECTED. → [doc](elster-anlage-kap-2025-gaps.md)
- **Vorabpauschale (§18 InvStG) — design for accumulating-ETF tax handling** — Explains how the app computes taxes today and designs the v2 full Vorabpauschale computation (v1 guard layer is implemented). → [doc](vorabpauschale-design.md)

## Architecture
- **Portfolio & Tax — Design Spec** — Foundational solution architecture for the multi-user portfolio app: ingest of Freedom Finance/IBKR statements, event-sourced ledger, analytics, and German Anlage KAP export. → [spec](superpowers/specs/2026-05-18-portfolio-tax-app-design.md)
- **Pulse Full-Fidelity — Design Spec** — Follow-on design spec defining the full set of Pulse dashboard widgets/screens on top of the portfolio-tax foundation. → [spec](superpowers/specs/2026-05-18-pulse-full-fidelity-design.md)

## Specs & Plans
- **Verlustvortrag planner — turning assessed loss carryforward into a plan** — spec, not yet planned into tasks — companion to the ELSTER multi-scenario spec, covering how to act on an assessed Aktien loss carryforward. → [spec](superpowers/specs/2026-07-19-carryforward-planner.md)
- **Folio → ELSTER: multi-scenario Anlage KAP / KAP-INV support** — spec, not yet planned into tasks — defines multi-scenario KAP/KAP-INV support based on the verified ELSTER 2025 field-by-field evidence log. → [spec](superpowers/specs/2026-07-19-elster-multi-scenario-support.md)
- **Agent Team & Skills — Design Spec** — Approved for planning — design for the committed Claude Code "team": 11 skills, 7 orchestrated agents, a documentation registry, and a pre-push gate. → [spec](superpowers/specs/2026-07-21-agent-team-and-skills-design.md)
- **Positions & Tax Redesign — Design Spec** — Approved for planning — presentational-only redesign of the Positions page and Tax area (hub + ELSTER route + Loss Harvest + Anlage SO) plus a global chrome polish, from the approved Claude Design mockups; no tax logic touched. → [spec](superpowers/specs/2026-07-21-positions-tax-redesign-design.md)
- **Portfolio & Tax — Implementation Plan** — Implementation plan to ship the multi-user portfolio app (ingest, ledger, 7 Pulse screens, Anlage KAP export) on Vercel Hobby. → [plan](superpowers/plans/2026-05-18-portfolio-tax-implementation.md)
- **Pulse v2 Phase 2: Pure-Function Analytics Modules Implementation Plan** — Implementation plan for 11 pure-function analytics modules under `src/lib/analytics/` with comprehensive Vitest coverage. → [plan](superpowers/plans/2026-05-18-pulse-v2-phase2-analytics.md)
- **ELSTER Field Registry + Emission Rewrite — Implementation Plan** — Implementation plan to make the ELSTER form itself the model (`elster-fields.ts`), fixing defects that caused a real filing to over-declare €3.611 of income. → [plan](superpowers/plans/2026-07-19-elster-field-registry.md)
- **Agent Team & Skills Implementation Plan** — Implementation plan to install the committed Claude Code "team": 11 project skills, 7 orchestrated agents, `docs/INDEX.md`, root `CLAUDE.md`, and a deterministic pre-push gate. → [plan](superpowers/plans/2026-07-21-agent-team-and-skills.md)

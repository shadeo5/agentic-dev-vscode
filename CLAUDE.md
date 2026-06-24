# CLAUDE.md — StoreFlow operating manual

> This file is the agent's "context contract." It's loaded automatically and
> tells any agent how to behave in this repo. Treat it as the single most
> important lever for getting good, consistent output. Keep it short, current,
> and specific — stale instructions are worse than none.

## What this project is
StoreFlow — a small store-fulfillment platform. See `SPEC.md` for the product
spec and milestones. This is also a learning repo for agentic development, so
**explain reasoning on non-trivial decisions** and prefer clarity over cleverness.

## Stack & layout
- Front end: React + Vite + TypeScript in `web/`
- API: Node + Express + TypeScript in `api/`
- Data: SQLite via `better-sqlite3`, schema/seed in `api/src/db/`
- Tests: Vitest (unit/integration), Playwright (e2e, later)
- Package manager: npm. Node 24 (Active LTS).

## Commands (keep these accurate — agents rely on them)
- Install: `npm install` (run in `web/` and `api/`)
- API dev server: `npm run dev` in `api/`
- Web dev server: `npm run dev` in `web/`
- Tests: `npm test` (per package)
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`

## Conventions
- TypeScript strict mode on. No `any` without a `// why:` comment.
- Functions/modules small and single-purpose. Pure functions for domain logic
  (e.g. the order state machine, inventory math) so they're trivially testable.
- API: REST, JSON, conventional status codes. Validate input at the boundary.
- Errors: never swallow; return typed error responses.
- Names: descriptive over short. No abbreviations in domain terms.

## Decisions (resolved — keep these)
- DB access: **raw SQL** via better-sqlite3 prepared statements (no ORM).
- Input validation: **Zod** at the HTTP boundary (one schema validates + infers types).
- Order transitions: a **single** endpoint `POST /orders/:id/transition` (body `{ to }`),
  funneled through the order state machine.
- Packages: **separate** npm packages in `web/` and `api/` (no workspaces yet).
- Tests: **co-locate** unit tests with source; integration tests in `__tests__/integration/`.

## Working agreement (how to drive vs. how to act)
1. For any non-trivial change, **propose a short plan first** and wait for
   approval before writing code.
2. Work in **small vertical slices**; one slice ≈ one PR.
3. **Test-first** for domain logic and endpoints. Don't mark work done with
   failing or missing tests.
4. After a change, show the **diff summary** and the commands you ran.
5. Use a **feature branch** per slice; never commit directly to `main`.
6. Conventional commit messages: `feat:`, `fix:`, `test:`, `chore:`, `docs:`.
7. Keep **`WORKLOG.md`** current — updating it is part of the Definition of
   Done, not an afterthought.

## Guardrails (inventory correctness is the whole point)
- Stock must never go negative. Decrement only on the FULFILLED transition.
- Only legal status transitions are allowed (see SPEC state machine).
- Seed data is for dev only; never assume it in tests — set up fixtures.

## Definition of done for a slice
Typecheck passes, lint passes, tests pass, diff reviewed, PR opened with a
description of what changed and how it was verified, and `WORKLOG.md` updated —
a new top entry (or the current one extended) covering Done / Decisions (and
why) / Follow-ups / Verification. The WORKLOG update rides in the **same PR as
the slice** (its own `docs:` commit), so each slice stays one PR.

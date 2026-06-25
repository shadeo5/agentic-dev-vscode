# StoreFlow — Implementation Plan (Milestones 1–4)

> Produced by a planning pass and reviewed before any code is written. Covers the
> backend foundation and first three vertical slices. Front-end dashboard (M4) and
> alerts/observability (M5–6) are deliberately deferred — M1–3 establish the domain
> core everything else depends on.

The central discipline of this backend is that **inventory correctness is
non-negotiable**. The architecture is organized around making the two risky
operations — order placement and fulfillment — provably correct and easy to test.
That is the "why" behind separating pure domain logic from the database and HTTP layers.

## 1. Repo / folder structure

Two independent npm packages, `web/` and `api/`, side by side. Not a formal
monorepo for now — each has its own `package.json`, installed/run separately.
Revisit if sharing types between them becomes painful (see Open Questions).

```
storeflow/
├── CLAUDE.md                  # agent context contract (exists)
├── SPEC.md                    # product spec (exists)
├── PLAN.md                    # this file
├── README.md                  # (exists)
├── .github/workflows/ci.yml   # lint + typecheck + test on PR
├── api/
│   ├── package.json, tsconfig.json, vitest.config.ts, eslint config
│   ├── storeflow.db           # SQLite file (git-ignored)
│   └── src/
│       ├── index.ts           # Express bootstrap, starts server
│       ├── app.ts             # builds the Express app (no listen) — importable by tests
│       ├── db/
│       │   ├── connection.ts  # opens better-sqlite3, exports the Database handle
│       │   ├── schema.sql     # CREATE TABLE statements (source of truth)
│       │   ├── migrate.ts     # applies schema.sql to a db file
│       │   └── seed.ts        # dev-only seed data
│       ├── domain/            # PURE functions — no I/O, no Express, no db
│       │   ├── orderStateMachine.ts
│       │   ├── inventory.ts
│       │   └── types.ts
│       ├── repositories/      # the ONLY place that touches the db
│       │   ├── productRepository.ts
│       │   ├── inventoryRepository.ts
│       │   └── orderRepository.ts
│       ├── routes/            # thin HTTP: parse → validate → call service → map errors
│       │   ├── catalogRoutes.ts
│       │   └── orderRoutes.ts
│       ├── services/          # orchestration: combines repos + domain in transactions
│       │   ├── orderService.ts
│       │   └── fulfillmentService.ts
│       ├── http/errors.ts     # typed error → status code mapping
│       └── __tests__/         # unit (domain) + integration (supertest)
└── web/
    └── src/                   # main.tsx, App.tsx, components — built in M4
```

Two non-obvious choices:
- `app.ts` builds the Express app but does **not** call `.listen()`; `index.ts` does.
  Lets integration tests import the app and drive it with supertest without binding a port.
- Layering `domain/ → repositories/ → services/ → routes/` is the spine. Dependencies
  point one way: routes know services, services know repos + domain, domain knows nothing.
  This makes the correctness-critical code unit-testable in isolation.

## 2. Data model & storage

Four tables. Declare types and use constraints aggressively — constraints are a
second line of defense for the "no negative stock" guarantee.

- **products**: id PK, sku TEXT UNIQUE, name, description, `price_cents` INTEGER
  (money as integer cents, never float), category.
- **inventory_items** (1–1 with product): product_id PK/FK, `quantity_on_hand`
  INTEGER with `CHECK (quantity_on_hand >= 0)`, `quantity_reserved` INTEGER with
  `CHECK (quantity_reserved >= 0)` and table-level `CHECK (quantity_reserved <=
  quantity_on_hand)`, reorder_threshold. **Sellable stock = available =
  on_hand − reserved.** The `reserved <= on_hand` check is the DB-level oversell
  backstop.
- **orders**: id PK, status with `CHECK (status IN (...))`, customer_name,
  created_at (ISO-8601).
- **order_line_items** (many per order): id PK, order_id FK, product_id FK,
  quantity `CHECK (quantity > 0)`, `unit_price_cents` — a **snapshot** of price at
  order time (an order must remember what was charged even if price later changes).

**better-sqlite3 is synchronous** — `.get()/.run()/.all()` return immediately, no
promises. Benefit: `db.transaction(fn)` wraps a sync function and rolls back
atomically if it throws — exactly what placement and fulfillment need to be
all-or-nothing (prevents double-decrement / partial writes). Enable
`PRAGMA foreign_keys = ON` on every connection. Tests build a fresh `:memory:` db
and run `migrate.ts` — never the seed (per CLAUDE.md guardrail).

## 3. API surface (M1–3)

| # | Method | Path | Purpose | Key statuses |
|---|---|---|---|---|
| M1 | GET | `/products` | List products with current stock | 200 |
| M1 | GET | `/products/:id` | Single product with stock | 200, 404 |
| M2 | POST | `/orders` | Place order; validate stock; reserve | 201; **409 insufficient stock**; 400; 404 |
| M3 | GET | `/orders` | List orders (`?status=`) for the queue | 200 |
| M3 | GET | `/orders/:id` | Order detail with line items | 200, 404 |
| M3 | POST | `/orders/:id/transition` | Advance status; decrement on FULFILLED | 200; **409 illegal transition**; 400; 404 |

Status reasoning: insufficient stock and illegal transition are both **409
Conflict** (well-formed request, conflicts with current state). Malformed body →
400; unknown id → 404.

## 4. Domain logic to keep pure

Two `domain/` modules with zero I/O — plain values in, plain values/typed errors
out. Trivially unit-testable: no mocks, no db, no HTTP. Because these are the only
places inventory can go wrong, they become the most heavily and cheaply tested code.

**orderStateMachine.ts** — single source of truth for legal transitions:

```
PLACED ──► PICKING ──► PACKED ──► FULFILLED   (terminal)
  │           │           │
  └──────► CANCELLED ◄─────┘                   (terminal)
```
- PLACED → PICKING | CANCELLED
- PICKING → PACKED | CANCELLED
- PACKED → FULFILLED | CANCELLED
- FULFILLED / CANCELLED → terminal

A const map is the whole implementation; the service asks this module and never
hardcodes a check.

**inventory.ts** — pure stock math: `hasSufficientStock`, `checkOrderStock`
(returns shortfalls, fed `available = on_hand − reserved`), `applyDecrement`
(throws rather than going < 0). The service composes these inside a
`db.transaction`. Reservation lifecycle: **placement** raises `quantity_reserved`
(on_hand untouched); **cancellation** lowers it; **FULFILLED** lowers BOTH
`quantity_on_hand` and `quantity_reserved` (the goods physically leave).
Invariant: `quantity_on_hand` is decremented **only** on `→ FULFILLED`.

## 5. Test strategy (Vitest)

- **Unit (pure, fast):** state machine (every legal transition, representative
  illegal/terminal); inventory (sufficient/insufficient/exact boundary, decrement
  never negative, multi-line shortfall).
- **Integration (supertest + `:memory:` db):** build app via `app.ts`, migrate a
  fresh db, insert fixtures (not seed); cover happy paths + 409/404/400 cases;
  verify stock decremented exactly once on FULFILLED and not before.
- **Not tested:** better-sqlite3 itself, Express.

Test-first order for slice M1: (1) failing integration test for `GET /products`,
(2) schema.sql + migrate, (3) productRepository, (4) route + app.ts wiring until green.

## 6. Vertical-slice breakdown (smallest shippable PRs, dependency order)

- **Slice 0 — Project skeleton** *(the teaching slice)*: package.json, strict
  tsconfig, Vitest/eslint, `GET /health` + one passing integration test via
  app.ts + supertest. Done when install/typecheck/lint/test all pass. Exercises the
  whole toolchain + the full agentic loop with almost no domain logic.
- **Slice 1 — DB schema + migrate + connection**: all four tables + constraints;
  test that migration creates them.
- **Slice 2 — Catalog read (M1)**: productRepository, `GET /products` + `/:id`,
  dev seed; integration tests incl. 404.
- **Slice 3 — Inventory check domain logic (M2a)**: pure inventory.ts + full unit tests.
- **Slice 4 — Order placement (M2b)**: orderService.placeOrder (transactional,
  snapshot prices, check stock, insert, **no decrement**), `POST /orders`; tests for
  201/409/404/400.
- **Slice 5 — State machine domain logic (M3a)**: pure orderStateMachine.ts + unit tests.
- **Slice 6 — Fulfillment transitions (M3b)**: fulfillmentService.transition
  (transactional, decrement only on FULFILLED), `GET /orders`, `/orders/:id`,
  `POST /orders/:id/transition`; tests for happy path, illegal → 409,
  decrement-exactly-once, cancellation paths.

Front-loads the pure-logic slices (3, 5) right before the slices that consume them.

## 7. Decisions (resolved with DRG)

**Resolved:** raw SQL (no ORM) · Zod validation · single `/transition` endpoint ·
separate npm packages (no workspaces yet) · co-located unit tests · **reservation
model** · **one line per product per order**. Details below.

**Reservation model (Slice 4):** placement *reserves* via a `quantity_reserved`
column rather than decrementing on-hand. Availability = `on_hand − reserved`, and
the DB `CHECK (reserved <= on_hand)` makes oversell impossible. Chosen over
(a) decrement-at-placement (breaks "decrement only on FULFILLED") and (b) accept
+ re-check (allows a "yes" at placement, "no" at fulfillment). Cancellation
releases the reservation; FULFILLED converts it to a real decrement.

**One line per product per order (Slice 4):** `UNIQUE (order_id, product_id)` plus
`consolidateLines` (pure) merging duplicate-product entries at placement. An
"edit a placed order" capability is out of M1–3 scope, but the constraint makes it
a trivial UPSERT when added.


1. **Raw SQL vs ORM** — *recommend raw SQL via better-sqlite3 prepared statements*
   (transparent, suits a learning repo; reconsider Drizzle later if repetitive).
2. **Input validation** — *recommend Zod at the HTTP boundary* (one schema validates
   + infers the TS type; avoids drift). Alternative: hand-written guards.
3. **Transition API shape** — *recommend single `/transition` endpoint* (one funnel
   through the state-machine guard) vs verb endpoints (`/pick`, `/pack`) which read
   more RESTfully.
4. **Monorepo tooling** — *recommend separate plain npm packages for now*; npm
   workspaces is the low-cost upgrade when we want to share domain types with the M4 front end.
5. **Test file location** — *recommend co-locate unit tests with source; integration
   tests in `__tests__/integration/`.*

## 8. M4 — Associate dashboard (front end)

> Planned after M1–M3 (the backend core) shipped. The dashboard is a React +
> Vite + TypeScript app in `web/` that consumes the existing HTTP API: a
> fulfillment queue, order actions, and a live stock view (SPEC M4).

### Stack & cross-cutting decisions (resolved with DRG)
- **React + Vite + TypeScript** (strict) in `web/`; a separate npm package (no
  workspaces yet — `web/` **duplicates** the API response types `Product`/`Order`;
  npm workspaces is the future upgrade to share them).
- **Data fetching: vanilla `fetch` + React hooks** — a small typed client plus
  `useState`/`useEffect` and a refetch helper after mutations. No data library
  (transparent; clarity over cleverness).
- **Dev API access: Vite dev proxy** — `/api` → `http://localhost:3000`, so the
  browser is same-origin: no CORS and no API change needed in dev. (A production
  deploy revisits this.)
- **Styling: Tailwind CSS.**
- **Tests: Vitest + React Testing Library** (component tests, mocked client) per
  slice; **Playwright e2e** in M4.4 (later, per SPEC).
- **CI: a sibling `web` job** in `.github/workflows/ci.yml` (typecheck + lint +
  test + build), required on `main` like the api job.

### Prep A (api) — expose available stock
Before the stock view, add `quantity_reserved` and derived `available =
on_hand − reserved` to `GET /products` and `/products/:id` (test-first). A "live
stock view" should show what's actually sellable, not just on-hand.

### Vertical slices (smallest shippable PRs, dependency order)
- **M4.0 — Front-end skeleton** *(the teaching slice):* scaffold `web/` (Vite,
  React, TS strict, Tailwind, eslint, Vitest + RTL), the Vite dev proxy, a minimal
  App that fetches the API and renders proof-of-life + one component test; add the
  `web` CI job. Done when install/typecheck/lint/test/build pass and CI is green.
- **M4.1 — Live stock view** *(read-only):* a typed API client + `Product` types;
  a catalog view listing products with on-hand / reserved / available. Component
  tests with a mocked client.
- **M4.2 — Fulfillment queue** *(read-only):* the orders list from `GET /orders`
  with a status filter; rows show customer, status, and line items (product names
  joined client-side from the catalog).
- **M4.3 — Advance & cancel orders** *(mutations — the interactive core):*
  per-order actions calling `POST /orders/:id/transition`, offering only legal next
  states, handling 409 / errors, refetching after.
- **M4.4 — e2e + polish** *(stretch):* Playwright e2e (seed → place → advance →
  fulfill, watching stock change) + loading / error / empty states.

Sequencing: **Prep A → M4.0 → M4.1 → M4.2 → M4.3 → (M4.4 later).** Same working
agreement as the backend: one slice ≈ one PR, test-first, WORKLOG updated.
Behavior-rich slices (M4.3) get acceptance criteria; the skeleton and read-only
views don't (value over box-checking).

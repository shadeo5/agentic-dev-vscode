# StoreFlow — Design Doc (How It Works)

> A reader's guide to the system as it actually exists in code today, not just
> as planned. For the *product* spec see [SPEC.md](SPEC.md); for the slice-by-slice
> *build plan* see [PLAN.md](PLAN.md); for the *why* behind each session's
> decisions see [WORKLOG.md](WORKLOG.md). This doc explains the **architecture
> and runtime behavior** of the `api/` backend.

---

## 1. What StoreFlow is

A small **store-fulfillment platform**: online orders are picked, packed, and
fulfilled from a single store's local inventory. The entire design exists to make
one thing provably correct — **inventory math is never wrong** (stock never goes
negative, never double-decrements). Every architectural choice traces back to that
guarantee.

Today the codebase is an **API-only backend** (no front end yet). The full order
lifecycle works: read the catalog with live stock, place orders (which **reserve**
stock), and advance them through the fulfillment state machine to FULFILLED
(decrement) or CANCELLED (release). Milestones M1–M3 are complete.

---

## 2. The layered architecture

The spine of the system is a one-directional dependency chain. Each layer only
knows about the one below it. This is what keeps the correctness-critical code
(the domain layer) testable in complete isolation — no database, no HTTP, no mocks.

```
   HTTP request
        │
        ▼
┌─────────────────┐   routes/      thin HTTP: parse → validate (Zod) → call down → map to status
│     routes      │                knows: services + repositories
└────────┬────────┘
         │
         ▼
┌─────────────────┐   services/    orchestration: combine repos + domain inside db.transaction
│    services     │                knows: repositories + domain
└────────┬────────┘
         │
    ┌────┴─────┐
    ▼          ▼
┌────────┐ ┌────────┐  repositories/  the ONLY place that touches SQL
│  repos │ │ domain │  domain/        PURE functions — zero I/O, knows NOTHING below it
└───┬────┘ └────────┘
    │
    ▼
┌─────────────────┐   db/          better-sqlite3 connection, schema.sql, migrate
│   SQLite (db)   │
└─────────────────┘
```

**Dependencies point one way:** `routes → services → repositories → db`, and
everything can call `domain`, but `domain` calls nothing. The further down you go,
the more heavily tested the code is — because that's where inventory can go wrong.

All layers now exist in the tree: Slices 4–6 added `services/` (orderService,
fulfillmentService), `http/errors.ts`, `domain/orderStateMachine.ts`, and the
order/inventory repositories.

---

## 3. The codebase, file by file

Everything lives in [`api/src/`](api/src):

| File | Layer | Role |
|---|---|---|
| [`index.ts`](api/src/index.ts) | bootstrap | The **only** place that binds a port. Opens the file-backed db, migrates, starts listening. |
| [`app.ts`](api/src/app.ts) | bootstrap | Builds the Express app but does **not** `listen()`. Takes an injected `db`. |
| [`db/connection.ts`](api/src/db/connection.ts) | db | `openDatabase()` — opens better-sqlite3, turns on `PRAGMA foreign_keys`. |
| [`db/schema.sql`](api/src/db/schema.sql) | db | Source of truth for the four tables + constraints. |
| [`db/migrate.ts`](api/src/db/migrate.ts) | db | Applies `schema.sql` to a db handle. Idempotent. |
| [`db/seed.ts`](api/src/db/seed.ts) | db | Dev-only seed data (`npm run seed`). Never used by tests. |
| [`domain/types.ts`](api/src/domain/types.ts) | domain | Pure types: `Product`, `Order`, `OrderLineItem`, `OrderStatus`. |
| [`domain/inventory.ts`](api/src/domain/inventory.ts) | domain | Pure stock math. The heart of the correctness guarantee. |
| [`domain/orders.ts`](api/src/domain/orders.ts) | domain | `consolidateLines` — merge duplicate-product lines (pure). |
| [`domain/orderStateMachine.ts`](api/src/domain/orderStateMachine.ts) | domain | Legal transitions: `canTransition`, `legalNextStates`, `isTerminal`. |
| [`repositories/productRepository.ts`](api/src/repositories/productRepository.ts) | repo | Reads products+stock via a LEFT JOIN; maps snake_case → camelCase. |
| [`repositories/inventoryRepository.ts`](api/src/repositories/inventoryRepository.ts) | repo | Stock levels + `reserve` / `fulfill` / `release` writes. |
| [`repositories/orderRepository.ts`](api/src/repositories/orderRepository.ts) | repo | Insert/list/read orders + line items; `updateStatus`. |
| [`services/orderService.ts`](api/src/services/orderService.ts) | service | `placeOrder` — transactional: consolidate, check stock, reserve. |
| [`services/fulfillmentService.ts`](api/src/services/fulfillmentService.ts) | service | `transition` — guarded status change + inventory effects. |
| [`http/errors.ts`](api/src/http/errors.ts) | http | Typed `AppError`s (404 / 409) → status mapping. |
| [`routes/catalogRoutes.ts`](api/src/routes/catalogRoutes.ts) | route | `GET /products`, `GET /products/:id`. Validates `:id` with Zod. |
| [`routes/orderRoutes.ts`](api/src/routes/orderRoutes.ts) | route | `POST /orders`, `GET /orders`(`?status=`), `GET /orders/:id`, transition. |

---

## 4. Two structural choices worth understanding up front

These two decisions explain most of the file layout.

### a) `app.ts` builds the app; `index.ts` runs it

`createApp(db)` constructs the Express app and returns it **without** calling
`.listen()`. Only `index.ts` binds a port. This split is what lets integration
tests import the app and drive it in-process with supertest — no real socket, no
port conflicts.

### b) The `db` handle is injected, not a global

`createApp(db)` receives the database as an argument. The dev server passes a
file-backed `storeflow.db`; tests pass a fresh `:memory:` database. Same app code,
different storage, full test isolation — without a module-level singleton.

```
index.ts:   openDatabase("storeflow.db") ─┐
                                           ├─► createApp(db) ──► Express app
test:       openDatabase(":memory:") ──────┘
```

---

## 5. Data model

Four tables ([`schema.sql`](api/src/db/schema.sql)). The guiding principle: **DB
constraints are a second line of defense** — the database refuses illegal states
even if application code has a bug. The CHECK and FOREIGN KEY constraints are
load-bearing, not decoration.

```
products                      inventory_items (1–1 with product)
┌──────────────┐              ┌─────────────────────┐
│ id (PK)      │◄─────────────│ product_id (PK, FK) │  ON DELETE CASCADE
│ sku (UNIQUE) │              │ quantity_on_hand    │  CHECK >= 0   ← "no negative stock"
│ name         │              │ quantity_reserved   │  CHECK >= 0
│ description  │              │ reorder_threshold   │  CHECK >= 0
│ price_cents  │  CHECK >= 0  └─────────────────────┘
│ category     │               CHECK (reserved <= on_hand) ← "no oversell"
└──────┬───────┘               available = on_hand − reserved
       │ (referenced by, does NOT cascade — history must survive)
       │
orders │                      order_line_items (many per order)
┌──────┴───────┐              ┌──────────────────────┐
│ id (PK)      │◄─────────────│ order_id (FK)        │  ON DELETE CASCADE
│ status       │  CHECK IN    │ product_id (FK)      │  no cascade
│ customer_name│  (5 states)  │ quantity             │  CHECK > 0
│ created_at   │              │ unit_price_cents     │  price SNAPSHOT
└──────────────┘              │ UNIQUE(order_id,     │  one line per product
                              │        product_id)   │
                              └──────────────────────┘
```

Non-obvious choices baked into the schema:

- **Stock has two parts:** `quantity_on_hand` (physically present) and
  `quantity_reserved` (spoken for by open orders). **Available = on_hand −
  reserved.** Placement raises reserved; FULFILLED lowers both; CANCELLED lowers
  reserved. The `CHECK (reserved <= on_hand)` is the DB-level **oversell backstop**.
- **`UNIQUE (order_id, product_id)`** — one line per product per order; re-ordering
  the same product consolidates into the existing line.
- **Money is integer `*_cents`, never a float** — no rounding drift, ever.
- **`unit_price_cents` is a snapshot** of the price at order time. An order must
  remember what was actually charged even if the product's price later changes.
- **`order_line_items.product_id` does not cascade** (but `order_id` does). You
  can't delete a product that historical orders reference.
- **`created_at` is supplied by the app**, not a DB default — so the application
  owns time and tests can pin it deterministically.
- **`PRAGMA foreign_keys = ON` lives in `connection.ts`**, not the schema. SQLite
  ships FK enforcement *off* per-connection; centralizing it in `openDatabase`
  means no connection can accidentally skip it.

---

## 6. Why better-sqlite3 (and why it matters)

better-sqlite3 is **synchronous** — `.get()`, `.run()`, `.all()` return values
directly, no promises. That isn't a limitation here; it's the enabling feature.
`db.transaction(fn)` wraps a synchronous function and **rolls back atomically if
it throws**. Order placement and fulfillment are inherently multi-step writes
that must be all-or-nothing — this gives that for free, and is the mechanism that
prevents partial writes and double-decrements in placement and fulfillment.

---

## 7. The inventory domain — the correctness core

[`domain/inventory.ts`](api/src/domain/inventory.ts) is pure: plain values in,
plain values out (or a throw). No db, no HTTP, no mocks needed to test it. Three
functions:

| Function | Contract |
|---|---|
| `hasSufficientStock(onHand, requested)` | `true` iff `onHand >= requested`. |
| `checkOrderStock(requests, stockLevels)` | Returns a `Shortfall[]`. Empty = whole order satisfiable. A product **missing** from `stockLevels` counts as **0 available** (unknown product = nothing in stock), yielding a precise shortfall instead of a crash. |
| `applyDecrement(onHand, quantity)` | Returns the new on-hand, or **throws** if it would go negative (or quantity is negative). |

The most important design decision lives in `applyDecrement`: it **throws rather
than clamping to 0**. Reaching a would-be-negative state means a stock check was
skipped upstream — silently clamping would *hide* that bug. When inventory
correctness is the whole point, you want the loud failure.

**The central invariant** these enforce, composed by the (future) services:
> Stock is **reserved** when an order is **placed**, but `quantity_on_hand` is
> only **decremented** on the transition to **FULFILLED** — exactly once.

---

## 8. Request lifecycle (what exists today)

Tracing a representative read, `GET /products/:id` (the same parse → repo → map
→ status shape every endpoint follows):

```
GET /products/42
   │
   ▼  routes/catalogRoutes.ts
   │   Zod: z.coerce.number().int().positive()  ── fails ──► 400 "Invalid product id"
   │   (malformed input is a 400, distinct from a missing resource)
   ▼  repositories/productRepository.ts
   │   getProductById(db, 42)
   │   SELECT ... FROM products LEFT JOIN inventory_items ...
   │   LEFT JOIN: a product with no inventory row reports 0 stock, isn't dropped
   │   maps snake_case row ──► camelCase Product (storage naming stops here)
   ▼
   row?  ── no ──► 404 "Product not found"
   │
   yes ──► 200 + JSON Product
```

Two boundary principles visible in that flow:
- **400 vs 404 are kept distinct.** A non-numeric/non-positive id is a *malformed
  request* (400); a well-formed id that simply isn't in the db is a *missing
  resource* (404).
- **The repository is the only place SQL lives.** Routes never write SQL;
  snake_case never leaks past the repository's `toProduct` mapping.

---

## 9. API surface

Live today (M1–M3, all merged):

| Method | Path | Purpose | Statuses |
|---|---|---|---|
| GET | `/health` | Liveness check | 200 |
| GET | `/products` | List products with current stock | 200 |
| GET | `/products/:id` | Single product with stock | 200, 404, 400 |
| POST | `/orders` | Place order; validate stock; reserve (no decrement) | 201; **409** insufficient stock; 404; 400 |
| GET | `/orders` | List orders (`?status=`) for the fulfillment queue | 200, 400 |
| GET | `/orders/:id` | Order detail with line items | 200, 404, 400 |
| POST | `/orders/:id/transition` | Advance status; decrement on FULFILLED, release on CANCELLED | 200; **409** illegal transition; 404; 400 |

Status convention: both *insufficient stock* and *illegal transition* are **409
Conflict** — the request is well-formed but conflicts with current state.
Malformed body → 400; unknown id → 404.

---

## 10. The order state machine

Order status is a constrained vocabulary in the DB (`CHECK status IN (...)`), and
is governed by a single pure module
([`domain/orderStateMachine.ts`](api/src/domain/orderStateMachine.ts)) that the
fulfillment service consults — no hardcoded transition checks anywhere else.

```
PLACED ──► PICKING ──► PACKED ──► FULFILLED   (terminal)
  │           │           │
  └───────────┴───────────┴──► CANCELLED      (terminal)
```

- `PLACED   → PICKING | CANCELLED`
- `PICKING  → PACKED  | CANCELLED`
- `PACKED   → FULFILLED | CANCELLED`
- `FULFILLED / CANCELLED → terminal`

Any non-terminal order may be **CANCELLED** right up until it ships. Two edges
have inventory effects, applied transactionally in `fulfillmentService.transition`:
- **`→ FULFILLED`** is the **only** place `quantity_on_hand` decrements — and it
  also releases the reservation (goods leave). Because FULFILLED is terminal, this
  happens **exactly once**.
- **`→ CANCELLED`** releases the reservation without decrementing (goods never left).

---

## 11. Testing strategy

Two kinds of tests, mirroring the layering:

- **Unit (pure, fast)** — co-located next to source (e.g.
  [`inventory.test.ts`](api/src/domain/inventory.test.ts)). Exhaustively tests the
  domain layer: sufficient/insufficient/exact-boundary stock, decrement-never-
  negative, multi-line shortfalls. No db, no HTTP.
- **Integration (supertest + `:memory:` db)** — in
  [`__tests__/integration/`](api/src/__tests__/integration). Build the app via
  `createApp(db)`, migrate a **fresh** in-memory db, insert **fixtures** (never the
  seed — a CLAUDE.md guardrail), then exercise real HTTP including 404/400 paths.

Behavior-rich slices (4 and 6) also carry **acceptance criteria** in
[ACCEPTANCE.md](ACCEPTANCE.md), written before the code; each test traces to a
criterion. Pure, total logic (the state machine) is specified by an exhaustive
test instead — value over duplication.

Not tested: better-sqlite3 and Express themselves. Current state: 82 tests passing
across 8 files.

---

## 12. How to run it

From [`api/`](api):

```bash
npm install        # install deps
npm run dev        # dev server on http://localhost:3000 (migrates storeflow.db on startup)
npm run seed       # load dev-only seed data (idempotent)
npm test           # vitest
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
```

CI (GitHub Actions) runs `npm ci → typecheck → lint → test` scoped to `api/` on
every PR into `main`; `main` is branch-protected and can't merge red.

---

## 13. Conventions & guardrails (the rules the code follows)

- **TypeScript strict mode.** No `any` without a `// why:` comment.
- **Pure functions for domain logic**, so correctness is trivially testable.
- **Raw SQL** via better-sqlite3 prepared statements — no ORM.
- **Zod validates at the HTTP boundary** — one schema validates and infers types.
- **Stock never goes negative; decrement only on FULFILLED.**
- **Seed data is dev-only** — never assumed in tests; tests build fixtures.
- **Vertical slices, one slice ≈ one PR**, feature branch per slice, never commit
  to `main`. WORKLOG updated as part of Definition of Done.

---

## 14. Where it's going next

The backend core (M1–M3) is **complete** — Slices 0–6 are merged: catalog read,
order placement with reservation, the pure state machine, and fulfillment
transitions (decrement-once on FULFILLED, release on CANCELLED).

Per [PLAN.md](PLAN.md), what remains:
- **M4 — Associate dashboard (front end):** the fulfillment queue UI, advance
  orders, live stock view (`web/`).
- **M5 — Low-stock alerts:** surface when `quantity_on_hand ≤ reorder_threshold`
  (later wired to Slack).
- **M6 — Observability:** structured request logging + a metrics summary endpoint.

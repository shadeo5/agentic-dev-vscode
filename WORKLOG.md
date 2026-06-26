# WORKLOG — Claude Code session log

A session-by-session record of agentic development activity on StoreFlow:
what was built, the non-obvious **decisions and reasoning**, and open
**follow-ups**. Git history and PR descriptions hold the granular *what*; this
file holds the *why* and the session-level narrative so context survives
between sessions.

**Convention:** newest entry on top. One entry per working session. Each entry
notes Done / Decisions / Follow-ups / Verification, and links PRs and commits.

---

## ▶ Resume here — next session

**Where we are:** M1–M3 backend **complete** (Slices 0–6). M4 front end: `web/`
skeleton (M4.0), Prep A (available stock), and **M4.1 live stock view** done.
`main` is branch-protected and gated on **both** CI checks (`api …` and `web …`).
To run locally: API `cd api && npm run dev`; web `cd web && npm run dev` (Vite
proxies `/api` → `:3000`).

**Pick up here → M4.2 — Fulfillment queue:** an orders list from `GET /orders`
with a status filter (the queue); rows show customer, status, and line items
(product names joined client-side from the catalog). Read-only. Test-first, new
`feat/` branch off `main`, one PR.

**Roadmap to "done" (finish the project):**
- [x] **M4.1** Live stock view
- [ ] **M4.2** Fulfillment queue (`GET /orders` + `?status=` filter)  ← next
- [ ] **M4.3** Advance & cancel orders (transition calls; *gets acceptance criteria*)
- [ ] **M4.4** Playwright e2e + polish
- [ ] **M5** Low-stock alerts (`quantity_on_hand ≤ reorder_threshold`; later Slack)
- [ ] **M6** Observability (request logging + a metrics summary endpoint)

**Parked / cleanup (don't lose these):**
- [ ] 4 Slice 4 review notes: inventory-row invariant AC · TOCTOU doc note ·
      response-shape AC · comment the unreachable 404 in `orderService`.
- [ ] Root `README.md` is stale bootstrap content (describes the workflow setup,
      not StoreFlow) — refresh it.
- [ ] `web/README.md` is default Vite boilerplate.
- [ ] Stray `agentic-workflow-setup-guide.html` at repo root — confirm if wanted.

---

## 2026-06-25 — M4.1: Live stock view (web/)

**Scope:** First real UI data — a typed API client + a catalog page showing live
stock. Read-only (component tests are the spec; no acceptance criteria).

### Done
- `api/client.ts` (typed `fetch` wrapper: `getProducts`/`getHealth` → `/api/*`)
  + `api/types.ts` (duplicated `Product`) + `format.ts` (`formatCents` via
  `Intl.NumberFormat`).
- `StockView` — `useProducts` hook (discriminated union: loading | error | ready)
  + a Tailwind table (Product / SKU / Price / on-hand / reserved / **available**);
  zero-available flagged red; loading / error / empty states.
- Kept the health badge: extracted `HealthBadge` into the dashboard header.
- 9 component tests (StockView 5, HealthBadge 2, App 2), mocking the client module.

### Decisions (and why)
- **`useProducts` discriminated union** — makes the three render states exhaustive
  and type-safe (no "data might be undefined" footguns).
- **Tests mock the client module** (not raw `fetch`) — cleaner, and avoids URL
  collisions now there are two endpoints.
- **`Intl.NumberFormat` for money** — correct rounding + symbol + thousands
  separators; formatting stays at the view boundary (money is integer cents).

### Verification
- In `web/`: test (9 passed), typecheck (`tsc -b`), lint, build all green.

### Next up
- **M4.2 — Fulfillment queue:** orders list + status filter.

### PRs / branches
- `#18` feat/m4.1-stock-view (this slice).

---

## 2026-06-24 — M4.0: Front-end skeleton (web/)

**Scope:** Scaffold the `web/` front end and prove the whole toolchain end-to-end
— the teaching slice for the dashboard. First front-end code in the repo.

### Done
- Scaffolded `web/` via `create-vite` (React 19 + Vite 8 + TS). Added **strict**
  to `tsconfig.app.json` (CLAUDE.md), removed template cruft.
- **Tailwind v4** via `@tailwindcss/vite` (`@import "tailwindcss"` in `index.css`).
- **Vite dev proxy**: `/api/*` → `http://localhost:3000` (no CORS in dev).
- **Switched the linter to eslint** (template shipped oxlint) for one linter across
  the repo, matching `api/`'s flat config + `react-hooks` rules.
- **Vitest + React Testing Library** (jsdom); proof-of-life `App` with a
  `useApiHealth` hook + 3 component tests (heading, ok, down) establishing the
  fetch/test pattern later slices reuse.
- **Web CI job** added to `ci.yml` (sibling to api): typecheck + lint + test +
  **build** (a front end can typecheck-pass yet fail to build).

### Decisions (and why)
- **eslint over the template's oxlint** — one linter across packages; consistency
  beats the template default.
- **Vite dev proxy over CORS** — same-origin in dev, zero API change (PLAN §8).
- **Build step in CI** — typecheck doesn't catch Vite/Tailwind build failures.

### Verification
- In `web/`: typecheck (`tsc -b`), lint, test (3 passed), build (Vite + Tailwind
  CSS emitted) all green locally.

### Next up
- **M4.1 — Live stock view:** typed API client + catalog page (on-hand / reserved
  / available from Prep A).

### PRs / branches
- `#16` feat/m4.0-skeleton (this slice).

---

## 2026-06-24 — M4 Prep A: expose available stock (api)

**Scope:** Small api change before the M4 front end — surface reservation on the
catalog so the "live stock view" can show what's actually sellable.

### Done
- `Product` now carries `quantityReserved` and derived `available = on_hand −
  reserved`; `productRepository.toProduct` computes it at the boundary (the
  `quantity_reserved` column already existed from Slice 4 — just not surfaced).
- `GET /products` and `/products/:id` return the new fields.
- Resolves the earlier flag that the catalog only showed on-hand.

### Verification
- `npm test` → 83 passed (8 files; +1 case: available = on-hand − reserved).
  typecheck + lint clean. Test-first (catalog tests red → green).

### Next up
- **M4.0 — Front-end skeleton:** scaffold `web/` (Vite/React/TS/Tailwind) + web CI job.

### PRs / branches
- `#15` feat/prep-a-available (this change).

---

## 2026-06-24 — Slice 6: Fulfillment transitions (M3b)

**Scope:** `POST /orders/:id/transition`, `GET /orders` (`?status=`),
`GET /orders/:id`. Closes the reservation lifecycle. **Spec-first** (behavior-
rich): ACCEPTANCE.md AC-6.1–6.16 written before code. Completes the M1–M3 backend.

### Done
- `fulfillmentService.transition` — one `db.transaction`: load → `canTransition`
  guard (409) → inventory effect → `updateStatus`.
  - **→ FULFILLED**: `inventoryRepository.fulfill` decrements on-hand AND releases
    the reservation in a single UPDATE. Decrement-exactly-once (FULFILLED terminal).
  - **→ CANCELLED**: `release` frees the reservation; on-hand untouched.
- `orderRepository.listOrders(status?)` + `updateStatus`; shared `toOrder` mapper.
- `IllegalTransitionError` (409) in `http/errors.ts`.
- `orderRoutes`: three new routes; Zod validates `{ to }` (enum) and `?status=`.
- **DESIGN.md brought current** — state-machine + data-model diagrams updated
  (PACKED→CANCELLED, `quantity_reserved`, oversell CHECK, UNIQUE), plus stale
  file table / API surface / "planned" status / test count (22→82).

### Decisions (and why)
- **Single funnel through the state machine** — the route never hardcodes a
  transition; it asks `canTransition`. Illegal/terminal → 409.
- **Fulfill = one UPDATE** (`on_hand -= n, reserved -= n`) so the
  `reserved <= on_hand` CHECK never sees a half-updated row.
- **`GET /orders` includes line items**, invalid `?status=` → 400 (boundary
  validation), consistent with the rest of the API.

### Follow-ups
- Parked Slice 4 review notes still open (inventory-row invariant AC, TOCTOU doc
  note, response-shape AC, unreachable-404 comment).
- [ ] M4 front end can now consume the full order lifecycle.

### Verification
- `npm test` → 82 passed (8 files; +13 fulfillment cases, red→green). typecheck +
  lint clean. All 16 ACs (AC-6.x) traced to tests.

### Next up
- **M4 — Associate dashboard (front end):** fulfillment queue UI in `web/`.

### PRs / branches
- `#13` feat/slice-6-fulfillment (this slice).

---

## 2026-06-24 — Slice 5: Order state machine (M3a)

**Scope:** Pure `orderStateMachine.ts` — the single source of truth for legal
order transitions, front-loaded before Slice 6 (fulfillment) consumes it.

### Done
- `domain/orderStateMachine.ts` (pure): `canTransition`, `legalNextStates`,
  `isTerminal`, backed by one `TRANSITIONS` const map.
- Exhaustive co-located test: all **25** (from, to) pairs checked against an
  independently-written truth table + terminal/next-state assertions (27 cases).
- Updated PLAN §4 + SPEC for the rule change below.

### Decisions (and why)
- **PACKED is now cancellable** (`PACKED → CANCELLED`), changing the documented
  machine (SPEC/PLAN previously allowed cancel only from PLACED/PICKING). Cleaner
  rule: any non-terminal order may be cancelled until it ships. Slice 6 must
  release the reservation on cancel from PACKED too.
- **No ACCEPTANCE.md for this slice** — deliberately. The logic is a small, total
  truth table; an exhaustive 25-pair test *is* the spec, so a prose criteria doc
  would be duplication, not coverage. Acceptance criteria are reserved for
  behavior-rich slices (Slice 6 will have them). Value over box-checking.
- **Pure predicates, no throwing** — the 409 "illegal transition" mapping belongs
  to Slice 6's endpoint, which calls `canTransition`.

### Follow-ups
- [ ] **Slice 6 fulfillment** consumes this: decrement on FULFILLED (release +
      convert reservation), release reservation on CANCELLED (incl. from PACKED),
      `POST /orders/:id/transition` → 409 on illegal transition.
- Parked Slice 4 review notes (revisit, likely small ACCEPTANCE/doc additions):
  - [ ] AC for "product with no inventory row → 0 available → 409" + invariant note.
  - [ ] Doc note: the `reserved <= on_hand` CHECK is the concurrency/TOCTOU backstop.
  - [ ] Explicit "response body = full Order" criterion (already covered by tests).
  - [ ] Comment the intentional unreachable 404 in `orderService` (type-narrowing).

### Verification
- `npm test` → 68 passed (7 files; +27 state-machine cases). typecheck + lint clean.

### Next up
- **Slice 6 — Fulfillment transitions (M3b):** `POST /orders/:id/transition`,
  `GET /orders`, `GET /orders/:id`; decrement-exactly-once on FULFILLED, release
  on cancel, illegal → 409. (Acceptance criteria apply here.)

### PRs / branches
- `#12` feat/slice-5-state-machine (this slice).

---

## 2026-06-24 — Slice 4: Order placement (M2b)

**Scope:** `POST /orders` with true stock reservation. First slice driven
**spec-first**: wrote `ACCEPTANCE.md` (AC-4.1–4.19) before the code, then traced
every test back to a criterion.

### Done
- **Reservation model** (new): `inventory_items.quantity_reserved` + DB
  `CHECK (reserved <= on_hand)` (oversell backstop). Available = on_hand −
  reserved. Placement reserves; on-hand untouched until FULFILLED.
- **One line per product per order**: `UNIQUE (order_id, product_id)` +
  `consolidateLines` (pure) merging duplicate entries at placement.
- `orderService.placeOrder` — one `db.transaction`: consolidate → 404 if product
  missing → `checkOrderStock` vs available (409 + shortfalls) → insert order +
  line items (price snapshot) → reserve.
- New `http/errors.ts` (typed `AppError`/`NotFoundError`/`InsufficientStockError`
  → status), `orderRepository`, `inventoryRepository`, `orderRoutes` (Zod body).
- `domain/orders.ts` + `domain/types.ts` (`Order`, `OrderStatus`).

### Decisions (and why)
- **Reserve, don't decrement, at placement** — closes the oversell gap the raw
  "check on-hand" model had (caught in review): two PLACED orders could each pass
  the same stock. The `reserved <= on_hand` CHECK makes it impossible.
- **Consolidate before the stock check** — ordering 3+3 of a 5-stock item is one
  request for 6 → 409, not a partial success (AC-4.19).
- **`http/errors.ts` introduced here** (deferred from Slice 2) — multiple error
  types finally justify the typed error→status layer.
- **Spec-first via ACCEPTANCE.md** — piloted the acceptance-criteria practice;
  edge cases now come from an explicit checklist, not just in-the-moment judgment.

### Follow-ups
- [ ] Backfill ACCEPTANCE.md for Slices 0–3 if the practice proves its worth.
- [ ] Slice 6 fulfillment must RELEASE reservations on cancel and CONVERT them
      (decrement on_hand AND reserved, single UPDATE) on FULFILLED.

### Verification
- `npm test` → 41 passed (6 files; +13 placement/consolidation/migrate cases).
- `npm run typecheck` + `npm run lint` clean. All 19 ACs traced to tests.

### Next up
- **Slice 5 — Order state machine (M3a):** pure `orderStateMachine.ts` + unit tests.

### PRs / branches
- `#11` feat/slice-4-order-placement (this slice).

---

## 2026-06-24 — Slice 3: Inventory check domain logic (M2a)

**Scope:** First pure-domain module + co-located unit tests. Zero I/O — front-
loaded right before Slice 4 (order placement) consumes it.

### Done
- `domain/inventory.ts` (pure): `hasSufficientStock`, `checkOrderStock`
  (returns `Shortfall[]` with `shortBy`; product missing from stock levels = 0
  available), `applyDecrement` (throws rather than going negative).
- `inventory.test.ts` co-located next to the module — first use of the
  co-located unit-test pattern (CLAUDE.md decision). 13 cases.

### Decisions (and why)
- **`applyDecrement` throws on would-go-negative / negative qty**, rather than
  clamping to 0 — a silent clamp would hide an over-decrement bug; throwing
  surfaces a skipped stock check. Still satisfies PLAN's "never returns < 0".
- **Missing product in `stockLevels` → 0 available** — yields a precise
  shortfall instead of a crash on unknown ids.
- **`Map<productId, onHand>`** as the stock input — O(1) lookups; decouples the
  pure math from how the service loads stock.

### Follow-ups
- [ ] Slice 4 composes these inside a `db.transaction` (placement reserves but
      does NOT decrement; decrement happens only on FULFILLED in Slice 6).

### Verification
- `npm test` → 22 passed (4 files; +13 inventory cases, red→green).
- `npm run typecheck` + `npm run lint` clean.

### Next up
- **Slice 4 — Order placement (M2b):** `orderService.placeOrder` (transactional,
  snapshot prices, check stock, NO decrement), `POST /orders`; 201 / 409 / 404 / 400.

### PRs / branches
- `#10` feat/slice-3-inventory (this slice).

---

## 2026-06-24 — Slice 2: Catalog read (M1)

**Scope:** Read-only catalog endpoints over the Slice 1 schema. Test-first per
PLAN §5: failing integration test → repository → route + `app.ts` wiring.

### Done
- `GET /products` (list with current stock) and `GET /products/:id`
  (200 / 404 / 400).
- `productRepository` — the only DB-touching module for catalog reads; LEFT JOIN
  `products` ⨝ `inventory_items`; maps `snake_case` rows → camelCase `Product`.
- `catalogRoutes` — thin HTTP; Zod validates `:id` (Zod introduced here).
- `createApp(db)` now takes an injected connection; `index.ts` opens + migrates
  `storeflow.db` on startup.
- `domain/types.ts` — pure `Product` type.
- `db/seed.ts` + `npm run seed` — dev-only, idempotent (`INSERT OR IGNORE`);
  never used by tests.

### Decisions (and why)
- **camelCase API** (`priceCents`, `quantityOnHand`), mapped in the repository —
  storage naming stops at the boundary; matches SPEC's domain vocabulary.
- **Malformed `:id` → 400, unknown → 404** — boundary validation separates a bad
  request from a missing resource.
- **LEFT JOIN** — a product with no inventory row reports 0 stock, not dropped.
- **No service layer yet** — pure read; routes call the repository directly
  (services arrive with orders, Slice 4).
- **`createApp(db)` injection** over a module-global singleton — lets tests pass a
  fresh `:memory:` db.
- **`http/errors.ts` deferred** to Slice 4, where there are multiple error types.
- **WORKLOG rule clarified** — entries now ride in the slice's own PR (one PR per
  slice), replacing the earlier "separate `docs/` PR" wording in CLAUDE.md.

### Follow-ups
- [ ] Bump `actions/checkout` + `actions/setup-node` `@v4 → @v5` (carried over).
- [ ] `http/errors.ts` typed error→status mapping arrives with Slice 4.

### Verification
- `npm test` → 9 passed (3 files; +5 catalog cases, red→green).
- `npm run typecheck` + `npm run lint` clean. `npm run seed` idempotent (4 rows).

### Next up
- **Slice 3 — Inventory check domain logic (M2a):** pure `inventory.ts` + unit tests.

### PRs / branches
- `#8` feat/slice-2-catalog (this slice).

---

## 2026-06-24 — Slices 0–1 + CI foundation

**Scope:** Commit the project scaffold, ship the first two vertical slices, and
stand up CI. Worked test-first per CLAUDE.md; one slice ≈ one PR; never committed
to `main`.

### Done
- **Project docs committed** — CLAUDE.md, SPEC.md, PLAN.md, SETUP.md (were
  untracked). Commit `docs: add project context contract, spec, plan, setup`.
- **Slice 0 — skeleton** (`PR #2`, merged): Express app via `app.ts` (no
  `.listen()`, so tests drive it in-process), `GET /health`, one supertest
  integration test. Verified: install clean, `npm test` green.
- **Slice 0.5 — CI** (`PR #4`, merged): `.github/workflows/ci.yml` — Node 24,
  `npm ci → typecheck → lint → test` scoped to `api/`, on every PR into `main`
  and push to `main`. CI green on its own PR (16s).
- **Slice 1 — DB schema + migrate + connection** (`PR #3`, merged): four tables
  (`products`, `inventory_items`, `orders`, `order_line_items`) with money as
  integer `*_cents` and constraints as load-bearing correctness; `connection.ts`
  (`openDatabase`, `PRAGMA foreign_keys = ON`); `migrate.ts` (applies
  `schema.sql`, idempotent). Test-first: migrate a fresh `:memory:` db, assert
  the four tables exist, prove the negative-stock CHECK and FK actually reject
  bad inserts. CI green on the runner incl. native `better-sqlite3` build (18s).
- **Branch hygiene:** dropped the stray `test-loop` branch (local + remote).
- **Session log** (`PR #5`, merged): added `WORKLOG.md` (this file).
- **Standing rule** (`PR #6`, merged): made keeping `WORKLOG.md` current part of
  the Definition of Done + working agreement in CLAUDE.md, so it happens every
  slice without being asked (reinforced by a saved memory).
- **Merged & protected `main`:** merged `PR #3/#5/#6`, then enabled branch
  protection — `api — typecheck, lint, test` is now a **required, strict** status
  check; force-push and deletion of `main` disabled. Slice 2+ cannot merge red.

### Decisions (and why)
- **Unstack rather than stack PRs.** Merged Slice 0 (#2) to `main` first, then
  rebased Slice 1 onto `main` — keeps each PR a clean single-slice diff instead
  of Slice 0's changes bleeding into Slice 1's review.
- **`PRAGMA foreign_keys = ON` lives in `connection.ts`, not `schema.sql`.** It's
  a per-connection setting (SQLite defaults it OFF), not a schema property;
  centralizing it means no connection can skip FK enforcement.
- **`order_line_items.product_id` does not cascade** (order_id does), and
  `unit_price_cents` is a price snapshot — historical orders must remember what
  was sold even if a product/price later changes.
- **`schema.sql` path resolved via `import.meta.url`**, not cwd, so migration
  works identically from tests / dev server / scripts.
- **CI ordering:** merged the CI slice first, then rebased Slice 1 so CI runs
  from the PR branch — Slice 1 became the first slice CI truly gates.
- **Dropped `test-loop`** — its only unique commit was a throwaway README line.

### Follow-ups
- [x] Merge `PR #3` (Slice 1) — done.
- [x] **Branch protection** on `main` — done (strict; required check
      `api — typecheck, lint, test`).
- [ ] Bump `actions/checkout` and `actions/setup-node` `@v4 → @v5` to clear the
      "Node 20 deprecated" CI warning (tiny chore).
- [ ] Seed data: revisit in Slice 2 (catalog read) — keep it dev-only, never
      assumed in tests.

### Next up
- **Slice 2 — Catalog read (M1):** `productRepository`, `GET /products` +
  `GET /products/:id`, dev seed; integration tests incl. 404.

### PRs / branches
- `#2` slice-0-skeleton · `#4` chore/slice-0.5-ci · `#3` feat/slice-1-db-schema ·
  `#5` docs/worklog · `#6` docs/worklog-rule — all merged.

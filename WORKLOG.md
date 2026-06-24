# WORKLOG — Claude Code session log

A session-by-session record of agentic development activity on StoreFlow:
what was built, the non-obvious **decisions and reasoning**, and open
**follow-ups**. Git history and PR descriptions hold the granular *what*; this
file holds the *why* and the session-level narrative so context survives
between sessions.

**Convention:** newest entry on top. One entry per working session. Each entry
notes Done / Decisions / Follow-ups / Verification, and links PRs and commits.

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

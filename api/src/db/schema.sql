-- StoreFlow schema — the single source of truth for table definitions.
--
-- Two principles drive every choice here:
--   1. Money is stored as integer *_cents, never floats (no rounding drift).
--   2. Constraints are a second line of defense for inventory correctness:
--      the database itself refuses illegal states even if application code
--      has a bug. CHECK and FOREIGN KEY constraints below are load-bearing,
--      not decorative.
--
-- IF NOT EXISTS makes applying this schema idempotent, so migrate() is safe
-- to run against an already-migrated database.

CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY,
  sku         TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  category    TEXT    NOT NULL
);

-- 1-to-1 with products: product_id is both PK and FK. ON DELETE CASCADE so a
-- product and its stock row are removed together.
CREATE TABLE IF NOT EXISTS inventory_items (
  product_id        INTEGER PRIMARY KEY
                      REFERENCES products(id) ON DELETE CASCADE,
  quantity_on_hand  INTEGER NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  reorder_threshold INTEGER NOT NULL DEFAULT 0 CHECK (reorder_threshold >= 0)
);

-- status is constrained to the order state machine's vocabulary (SPEC/PLAN).
-- created_at is an ISO-8601 string supplied by the app, not a DB default,
-- so the application owns time and tests can pin it deterministically.
CREATE TABLE IF NOT EXISTS orders (
  id            INTEGER PRIMARY KEY,
  status        TEXT    NOT NULL DEFAULT 'PLACED'
                  CHECK (status IN ('PLACED', 'PICKING', 'PACKED', 'FULFILLED', 'CANCELLED')),
  customer_name TEXT    NOT NULL,
  created_at    TEXT    NOT NULL
);

-- Many line items per order. unit_price_cents is a SNAPSHOT of the product
-- price at order time: an order must remember what was charged even if the
-- product's price later changes. order_id cascades; product_id does NOT
-- cascade — a product referenced by historical orders must not be deletable.
CREATE TABLE IF NOT EXISTS order_line_items (
  id               INTEGER PRIMARY KEY,
  order_id         INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id       INTEGER NOT NULL REFERENCES products(id),
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0)
);

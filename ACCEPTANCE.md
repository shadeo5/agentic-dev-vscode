# ACCEPTANCE.md — behavior criteria

Acceptance criteria are the **definition of correct**, kept separate from
*what the product is* (SPEC.md) and *how it's built* (PLAN.md). Each criterion
is a Given / When / Then behavior that the implementation must satisfy and that
a test traces back to. Written **before** the code (spec-first), so the tests
have an explicit checklist instead of relying on whoever remembers an edge case.

**Convention:** criteria are grouped by slice and numbered `AC-<slice>.<n>`.
Each notes the test that covers it (`migrate` = schema/integration, `unit` =
pure domain, `int` = HTTP integration via supertest). A criterion with no
passing test is not "done."

> Pilot scope: started at Slice 4 (the most edge-case-dense slice). Slices 0–3
> may be backfilled later if this proves its worth.

---

## Slice 4 — Order placement (`POST /orders`)

Context: placement creates an order from line items, **reserves** stock
(`available = quantity_on_hand − quantity_reserved`), and **never** decrements
`quantity_on_hand` (that waits for FULFILLED, Slice 6). All steps are atomic —
any failure writes nothing.

### Happy path
- **AC-4.1** *(int)* — Given product X has 5 available, When I place an order for
  3 of X, Then **201**; the order is returned with status `PLACED`; X's
  `quantity_reserved` rises by 3; X's `quantity_on_hand` is unchanged.
- **AC-4.2** *(int)* — Given several distinct in-stock products, When I place one
  order for all of them, Then **201** with a line item per product, each reserved.
- **AC-4.3** *(int)* — Given X is priced at P cents, When the order is placed,
  Then the line's `unit_price_cents` equals P (a **snapshot**), independent of any
  later price change.
- **AC-4.4** *(int)* — Then the created order's `created_at` is a valid ISO-8601
  timestamp set at placement.

### Boundary
- **AC-4.5** *(int)* — Given X has exactly 5 available, When I order exactly 5,
  Then **201** (exact-boundary succeeds) and available becomes 0.

### Line-item consolidation (one line per product per order)
- **AC-4.6** *(unit)* — Given a request listing the same product twice (2 and 5),
  When consolidated, Then it becomes a single line of 7; distinct products are
  left as separate lines and order is otherwise preserved.
- **AC-4.7** *(int)* — Given a `POST /orders` body that lists X twice (2 and 5),
  When placed, Then the order has **one** line for X with quantity **7**, and
  `quantity_reserved` for X rises by 7.
- **AC-4.8** *(migrate)* — Given two line items with the same `(order_id,
  product_id)`, When inserted, Then the database **rejects** the second (UNIQUE).
- **AC-4.19** *(int)* — Consolidation happens **before** the stock check: given X
  has 5 available, When I order 3 and 3 of X (consolidates to 6), Then **409**
  (6 > 5), not a partial success.

### Reservation prevents oversell
- **AC-4.9** *(int)* — Given X has 5 on hand and 5 already reserved (0 available),
  When I order 1 more of X, Then **409** with a shortfall
  `{ productId: X, requested: 1, available: 0, shortBy: 1 }`.
- **AC-4.10** *(migrate)* — Given the DB CHECK `quantity_reserved ≤
  quantity_on_hand`, When a write would push reserved above on-hand, Then the
  database **rejects** it (the oversell backstop).

### Insufficient stock
- **AC-4.11** *(int)* — Given X has 2 available, When I order 5 of X, Then **409**
  with shortfalls listing X; and **nothing** is written (no order, no line items,
  no reservation change) — full rollback.
- **AC-4.12** *(int)* — Given a multi-product order where one product is short,
  Then **409** lists only the short product(s) and the whole order rolls back
  (an in-stock product in the same order is **not** reserved).

### Unknown product
- **AC-4.13** *(int)* — Given a line references a product id that doesn't exist,
  When placed, Then **404**; nothing is written (rollback).

### Malformed request (400, Zod at the boundary)
- **AC-4.14** *(int)* — Missing or empty `customerName` → **400**.
- **AC-4.15** *(int)* — Empty `items` array → **400**.
- **AC-4.16** *(int)* — A line with `quantity ≤ 0` or non-integer → **400**.
- **AC-4.17** *(int)* — A line missing `productId` or with a non-integer id → **400**.

### Atomicity (cross-cutting)
- **AC-4.18** *(int)* — For every rejection path (409 / 404), no partial state
  remains: order, line items, and reservations are all rolled back together
  (guaranteed by a single `db.transaction`).

---

## Slice 6 — Fulfillment transitions

Context: orders advance through the state machine via one funnel,
`POST /orders/:id/transition` (body `{ to }`), guarded by `canTransition`.
Inventory effects happen on exactly two transitions: **FULFILLED** decrements
on-hand AND releases the reservation (the goods leave); **CANCELLED** releases
the reservation only (goods never left). All effects are transactional. Plus
read endpoints for the fulfillment queue.

### Legal transitions (no inventory effect)
- **AC-6.1** *(int)* — Given a PLACED order, When `{ to: "PICKING" }`, Then 200,
  status is PICKING, and no inventory changes.
- **AC-6.2** *(int)* — PICKING → PACKED → 200, status PACKED, inventory unchanged.

### Fulfillment — the only decrement
- **AC-6.3** *(int)* — Given a PACKED order reserving N of product X (on_hand H,
  reserved R), When `{ to: "FULFILLED" }`, Then 200, status FULFILLED, and X has
  `quantity_on_hand = H − N` **and** `quantity_reserved = R − N` (decrement and
  release together).
- **AC-6.4** *(int)* — **Decrement-exactly-once:** Given a FULFILLED order, When
  transitioned again, Then 409 and inventory is unchanged (FULFILLED is terminal,
  so a double decrement is impossible).

### Cancellation — release the reservation
- **AC-6.5** *(int)* — Given a PLACED order reserving N of X, When
  `{ to: "CANCELLED" }`, Then 200, status CANCELLED, X's `quantity_reserved`
  drops by N, and `quantity_on_hand` is unchanged (goods never left).
- **AC-6.6** *(int)* — Cancel is allowed from PACKED: a PACKED order →
  CANCELLED returns 200 and releases the reservation.

### Illegal transitions → 409
- **AC-6.7** *(int)* — Given a PLACED order, When `{ to: "FULFILLED" }` (skips
  states), Then 409; status and inventory unchanged.
- **AC-6.8** *(int)* — Out of a terminal state (FULFILLED or CANCELLED), any
  transition → 409.

### Not found / malformed
- **AC-6.9** *(int)* — Unknown order id → 404.
- **AC-6.10** *(int)* — Body missing `to`, or `to` not a valid status → 400.
- **AC-6.11** *(int)* — Malformed `:id` (non-numeric) → 400.

### Atomicity
- **AC-6.12** *(int)* — A rejected transition (409 / 404) leaves both order status
  and inventory unchanged — no partial writes (single `db.transaction`).

### Listing & detail (the fulfillment queue)
- **AC-6.13** *(int)* — `GET /orders` returns all orders, each with its line items,
  newest or id order.
- **AC-6.14** *(int)* — `GET /orders?status=PLACED` returns only PLACED orders.
- **AC-6.15** *(int)* — `GET /orders?status=BOGUS` (not a valid status) → 400.
- **AC-6.16** *(int)* — `GET /orders/:id` returns the order with line items (200);
  unknown id → 404; non-numeric id → 400.

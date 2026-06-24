# StoreFlow — Product Spec

A small **store-fulfillment platform**: online orders are picked, packed, and
fulfilled from a single store's local inventory. Built as a learning vehicle for
agentic development, but designed like a real (small) production app.

## Why this project
It mirrors real retail-ops concerns (catalog, inventory accuracy, order state
machines, low-stock signals) so design decisions have obvious right/wrong
answers — which makes it a good environment to practice *driving* an agent and
*reviewing* its output.

## Users
- **Customer** (implicit): places an order through an API/UI.
- **Store associate**: works a fulfillment queue — picks, packs, completes orders.
- **Store manager**: watches inventory and low-stock alerts.

## Core domain
- **Product**: id, sku, name, description, price, category.
- **InventoryItem**: productId, quantityOnHand, reorderThreshold.
- **Order**: id, status, createdAt, lineItems[], customerName.
- **OrderLineItem**: productId, quantity, unitPrice.
- **Order status machine**: `PLACED → PICKING → PACKED → FULFILLED`
  (plus `CANCELLED` from PLACED/PICKING).

## Milestones (vertical slices — each shippable)
1. **Catalog + inventory (read).** List products with current stock. Seeded data.
2. **Order placement.** Create an order from line items; validate stock exists;
   reject if insufficient. Inventory is *reserved* but not yet decremented.
3. **Fulfillment workflow.** Associate advances an order through the status
   machine. Stock decrements on FULFILLED. Illegal transitions rejected.
4. **Associate dashboard (front end).** Fulfillment queue UI; advance orders;
   live stock view. (Plays to front-end strength.)
5. **Low-stock alerts.** When quantityOnHand ≤ reorderThreshold, surface an
   alert (later wired to Slack in Phase 4).
6. **Observability.** Structured request logging + a `/metrics`-style summary
   endpoint (orders by status, low-stock count).

## Non-goals (for now)
Auth/users, payments, multi-store, real customer UI. Keep scope tight; depth
over breadth.

## Quality bar
- Every endpoint and state transition has tests.
- Inventory math is never wrong (no negative stock; no double-decrement).
- Small, reviewable commits — one slice (or sub-slice) per PR.

## Tech stack
- **Front end:** React + Vite + TypeScript.
- **API:** Node + Express + TypeScript.
- **Data:** SQLite via `better-sqlite3` (simple, file-based, no server).
- **Tests:** Vitest (unit/integration) + Playwright (e2e, added later).
- **CI:** GitHub Actions (lint + typecheck + test on PR).

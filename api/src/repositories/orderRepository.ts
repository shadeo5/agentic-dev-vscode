import type { Db } from "../db/connection";
import type { Order, OrderLineItem, OrderStatus } from "../domain/types";

interface OrderRow {
  id: number;
  status: OrderStatus;
  customer_name: string;
  created_at: string;
}

// Shared mappers so getOrderById and listOrders return identical shapes.
function lineItemsFor(db: Db, orderId: number): OrderLineItem[] {
  const lines = db
    .prepare(
      "SELECT product_id, quantity, unit_price_cents FROM order_line_items WHERE order_id = ? ORDER BY id",
    )
    .all(orderId) as {
    product_id: number;
    quantity: number;
    unit_price_cents: number;
  }[];
  return lines.map((line) => ({
    productId: line.product_id,
    quantity: line.quantity,
    unitPriceCents: line.unit_price_cents,
  }));
}

function toOrder(db: Db, row: OrderRow): Order {
  return {
    id: row.id,
    status: row.status,
    customerName: row.customer_name,
    createdAt: row.created_at,
    lineItems: lineItemsFor(db, row.id),
  };
}

// The only module that reads/writes the orders and order_line_items tables.

// Insert a new order in the initial PLACED state; returns its id.
export function insertOrder(
  db: Db,
  customerName: string,
  createdAt: string,
): number {
  const info = db
    .prepare(
      "INSERT INTO orders (status, customer_name, created_at) VALUES ('PLACED', ?, ?)",
    )
    .run(customerName, createdAt);
  return Number(info.lastInsertRowid);
}

// Insert one line item. The UNIQUE (order_id, product_id) constraint means the
// caller must consolidate duplicate products before calling this.
export function insertLineItem(
  db: Db,
  orderId: number,
  productId: number,
  quantity: number,
  unitPriceCents: number,
): void {
  db.prepare(
    "INSERT INTO order_line_items (order_id, product_id, quantity, unit_price_cents) VALUES (?, ?, ?, ?)",
  ).run(orderId, productId, quantity, unitPriceCents);
}

// Fetch an order with its line items, or undefined if it doesn't exist.
export function getOrderById(db: Db, id: number): Order | undefined {
  const row = db
    .prepare(
      "SELECT id, status, customer_name, created_at FROM orders WHERE id = ?",
    )
    .get(id) as OrderRow | undefined;
  return row ? toOrder(db, row) : undefined;
}

// List orders (optionally filtered by status), each with its line items.
// The fulfillment queue uses this; ordered by id for stable output.
export function listOrders(db: Db, status?: OrderStatus): Order[] {
  const rows = (
    status
      ? db
          .prepare(
            "SELECT id, status, customer_name, created_at FROM orders WHERE status = ? ORDER BY id",
          )
          .all(status)
      : db
          .prepare(
            "SELECT id, status, customer_name, created_at FROM orders ORDER BY id",
          )
          .all()
  ) as OrderRow[];
  return rows.map((row) => toOrder(db, row));
}

// Advance an order's status. The caller (fulfillment service) is responsible
// for validating the transition and applying inventory effects first.
export function updateStatus(db: Db, id: number, status: OrderStatus): void {
  db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, id);
}

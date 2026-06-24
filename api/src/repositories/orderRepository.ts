import type { Db } from "../db/connection";
import type { Order } from "../domain/types";

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
  const order = db
    .prepare(
      "SELECT id, status, customer_name, created_at FROM orders WHERE id = ?",
    )
    .get(id) as
    | { id: number; status: Order["status"]; customer_name: string; created_at: string }
    | undefined;
  if (!order) return undefined;

  const lines = db
    .prepare(
      "SELECT product_id, quantity, unit_price_cents FROM order_line_items WHERE order_id = ? ORDER BY id",
    )
    .all(id) as {
    product_id: number;
    quantity: number;
    unit_price_cents: number;
  }[];

  return {
    id: order.id,
    status: order.status,
    customerName: order.customer_name,
    createdAt: order.created_at,
    lineItems: lines.map((line) => ({
      productId: line.product_id,
      quantity: line.quantity,
      unitPriceCents: line.unit_price_cents,
    })),
  };
}

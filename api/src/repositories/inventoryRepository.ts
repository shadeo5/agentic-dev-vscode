import type { Db } from "../db/connection";

// The only module that reads/writes inventory stock columns. Available-to-sell
// is on_hand - reserved; this repo exposes the raw numbers and the reserve
// operation, and the service composes them inside a transaction.

export interface StockLevel {
  onHand: number;
  reserved: number;
}

// Current on-hand / reserved for several products, keyed for O(1) lookup.
// A product absent from the map has no inventory row (treat as 0/0).
export function getStockLevels(
  db: Db,
  productIds: number[],
): Map<number, StockLevel> {
  if (productIds.length === 0) return new Map();
  const placeholders = productIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT product_id, quantity_on_hand, quantity_reserved
       FROM inventory_items
       WHERE product_id IN (${placeholders})`,
    )
    .all(...productIds) as {
    product_id: number;
    quantity_on_hand: number;
    quantity_reserved: number;
  }[];
  return new Map(
    rows.map((row) => [
      row.product_id,
      { onHand: row.quantity_on_hand, reserved: row.quantity_reserved },
    ]),
  );
}

// Reserve stock for a product (placement). The DB CHECK (reserved <= on_hand)
// is the backstop: if this ever exceeds on-hand, the statement throws and the
// surrounding transaction rolls back.
export function reserve(db: Db, productId: number, quantity: number): void {
  db.prepare(
    "UPDATE inventory_items SET quantity_reserved = quantity_reserved + ? WHERE product_id = ?",
  ).run(quantity, productId);
}

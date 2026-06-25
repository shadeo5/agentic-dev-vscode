import type { Db } from "../db/connection";
import type { Product } from "../domain/types";

// The ONLY module that touches the products/inventory tables for reads.
// Routes call these functions; they never write SQL themselves.

// A joined row exactly as SQLite returns it: snake_case columns. Stock columns
// may be NULL if a product somehow has no inventory row.
interface ProductRow {
  id: number;
  sku: string;
  name: string;
  description: string;
  price_cents: number;
  category: string;
  quantity_on_hand: number | null;
  quantity_reserved: number | null;
}

// LEFT JOIN (not INNER) so a product still appears even if its inventory row
// is missing — we report 0 stock rather than dropping the product silently.
const SELECT_PRODUCTS = `
  SELECT p.id, p.sku, p.name, p.description, p.price_cents, p.category,
         i.quantity_on_hand, i.quantity_reserved
  FROM products p
  LEFT JOIN inventory_items i ON i.product_id = p.id
`;

// Map a DB row (snake_case, nullable stock) to the API/domain Product
// (camelCase). This is the boundary where storage naming stops leaking outward.
// `available` is derived here so callers never recompute on-hand − reserved.
function toProduct(row: ProductRow): Product {
  const quantityOnHand = row.quantity_on_hand ?? 0;
  const quantityReserved = row.quantity_reserved ?? 0;
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    priceCents: row.price_cents,
    category: row.category,
    quantityOnHand,
    quantityReserved,
    available: quantityOnHand - quantityReserved,
  };
}

export function listProducts(db: Db): Product[] {
  const rows = db.prepare(`${SELECT_PRODUCTS} ORDER BY p.id`).all() as ProductRow[];
  return rows.map(toProduct);
}

export function getProductById(db: Db, id: number): Product | undefined {
  const row = db.prepare(`${SELECT_PRODUCTS} WHERE p.id = ?`).get(id) as
    | ProductRow
    | undefined;
  return row ? toProduct(row) : undefined;
}

// Fetch several products by id at once, keyed for O(1) lookup. Absence from the
// returned map means the id doesn't exist — order placement uses this for its
// existence check (404) and for the price snapshot.
export function getProductsByIds(
  db: Db,
  ids: number[],
): Map<number, Product> {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => "?").join(", ");
  const rows = db
    .prepare(`${SELECT_PRODUCTS} WHERE p.id IN (${placeholders})`)
    .all(...ids) as ProductRow[];
  return new Map(rows.map((row) => [row.id, toProduct(row)]));
}

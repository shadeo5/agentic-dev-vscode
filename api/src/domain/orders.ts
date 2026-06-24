// Pure order-shaping logic — no I/O. The companion to the DB UNIQUE
// (order_id, product_id) constraint: one line per product per order.

export interface OrderLineRequest {
  productId: number;
  quantity: number;
}

// Merge duplicate-product lines into one, summing quantities, preserving the
// order of first appearance (Map keeps insertion order). Run this before the
// stock check so that ordering the same product twice is checked and reserved
// as a single combined quantity.
export function consolidateLines(
  lines: OrderLineRequest[],
): OrderLineRequest[] {
  const quantityByProduct = new Map<number, number>();
  for (const { productId, quantity } of lines) {
    quantityByProduct.set(
      productId,
      (quantityByProduct.get(productId) ?? 0) + quantity,
    );
  }
  return [...quantityByProduct].map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
}

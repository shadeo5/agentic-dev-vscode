// Pure inventory math — no I/O, no db, no Express. Plain values in, plain
// values out (or a throw on an invariant violation). The order/fulfillment
// services compose these inside a db.transaction; keeping the arithmetic pure
// here is what makes "stock never goes negative" cheaply and exhaustively
// testable.

// True iff there is enough on hand to satisfy `requested`.
export function hasSufficientStock(onHand: number, requested: number): boolean {
  return onHand >= requested;
}

// A requested quantity for a single product.
export interface StockRequest {
  productId: number;
  requested: number;
}

// Where, and by how much, stock falls short for a product.
export interface Shortfall {
  productId: number;
  requested: number;
  available: number;
  shortBy: number; // always > 0
}

// Check every requested line against available stock and return the shortfalls.
// An empty array means the whole order can be satisfied. A product absent from
// `stockLevels` is treated as 0 available (unknown product = nothing in stock),
// so the caller still gets a precise shortfall rather than a crash.
export function checkOrderStock(
  requests: StockRequest[],
  stockLevels: Map<number, number>,
): Shortfall[] {
  const shortfalls: Shortfall[] = [];
  for (const { productId, requested } of requests) {
    const available = stockLevels.get(productId) ?? 0;
    if (!hasSufficientStock(available, requested)) {
      shortfalls.push({
        productId,
        requested,
        available,
        shortBy: requested - available,
      });
    }
  }
  return shortfalls;
}

// Apply a decrement to on-hand stock. Refuses (throws) rather than ever
// returning a negative value: reaching this state means a stock check was
// skipped upstream, and silently clamping to 0 would hide that bug — the
// opposite of what we want when inventory correctness is the whole point.
export function applyDecrement(onHand: number, quantity: number): number {
  if (quantity < 0) {
    throw new RangeError(`decrement quantity must be non-negative, got ${quantity}`);
  }
  const result = onHand - quantity;
  if (result < 0) {
    throw new RangeError(
      `decrement would make stock negative: ${onHand} - ${quantity} = ${result}`,
    );
  }
  return result;
}

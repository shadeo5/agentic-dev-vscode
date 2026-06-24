import type { Db } from "../db/connection";
import type { Order } from "../domain/types";
import { consolidateLines, type OrderLineRequest } from "../domain/orders";
import { checkOrderStock } from "../domain/inventory";
import { NotFoundError, InsufficientStockError } from "../http/errors";
import * as productRepository from "../repositories/productRepository";
import * as inventoryRepository from "../repositories/inventoryRepository";
import * as orderRepository from "../repositories/orderRepository";

export interface PlaceOrderInput {
  customerName: string;
  items: OrderLineRequest[];
}

// Place an order: consolidate lines, verify the products exist, check stock
// against AVAILABLE (on_hand - reserved), then insert the order + line items and
// reserve stock — all in one transaction so any failure writes nothing.
// Crucially this RESERVES but never decrements quantity_on_hand (that happens
// only on FULFILLED, Slice 6).
//
// `now` is injectable so tests can pin created_at; it defaults to real time.
export function placeOrder(
  db: Db,
  input: PlaceOrderInput,
  now: () => string = () => new Date().toISOString(),
): Order {
  const lines = consolidateLines(input.items);
  const productIds = lines.map((line) => line.productId);

  const place = db.transaction((): number => {
    const products = productRepository.getProductsByIds(db, productIds);

    // Existence check first → 404 (and roll back before touching anything).
    for (const id of productIds) {
      if (!products.has(id)) {
        throw new NotFoundError(`Product ${id} not found`);
      }
    }

    // Available-to-sell per product, then the pure stock check → 409.
    const stock = inventoryRepository.getStockLevels(db, productIds);
    const available = new Map<number, number>(
      productIds.map((id) => {
        const level = stock.get(id);
        return [id, level ? level.onHand - level.reserved : 0];
      }),
    );
    const shortfalls = checkOrderStock(
      lines.map((line) => ({ productId: line.productId, requested: line.quantity })),
      available,
    );
    if (shortfalls.length > 0) {
      throw new InsufficientStockError(shortfalls);
    }

    // Write the order, snapshot prices on each line, and reserve stock.
    const orderId = orderRepository.insertOrder(db, input.customerName, now());
    for (const line of lines) {
      const product = products.get(line.productId);
      if (!product) {
        throw new NotFoundError(`Product ${line.productId} not found`);
      }
      orderRepository.insertLineItem(
        db,
        orderId,
        line.productId,
        line.quantity,
        product.priceCents,
      );
      inventoryRepository.reserve(db, line.productId, line.quantity);
    }
    return orderId;
  });

  const orderId = place();
  const order = orderRepository.getOrderById(db, orderId);
  if (!order) {
    // Unreachable: we just inserted it in the same connection.
    throw new Error(`order ${orderId} missing immediately after placement`);
  }
  return order;
}

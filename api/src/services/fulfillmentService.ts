import type { Db } from "../db/connection";
import type { Order, OrderStatus } from "../domain/types";
import { canTransition } from "../domain/orderStateMachine";
import { NotFoundError, IllegalTransitionError } from "../http/errors";
import * as orderRepository from "../repositories/orderRepository";
import * as inventoryRepository from "../repositories/inventoryRepository";

// Advance an order to a new status. Every status change funnels through here and
// the state machine — no transition check is hardcoded anywhere else.
//
// Inventory effects happen on exactly two transitions, both inside the same
// transaction as the status update (all-or-nothing):
//   → FULFILLED  decrement on-hand AND release reservation (goods leave)
//   → CANCELLED  release reservation only (goods never left)
// Because FULFILLED is terminal, the decrement happens at most once per order.
export function transition(db: Db, orderId: number, to: OrderStatus): Order {
  const run = db.transaction((): void => {
    const order = orderRepository.getOrderById(db, orderId);
    if (!order) {
      throw new NotFoundError(`Order ${orderId} not found`);
    }
    if (!canTransition(order.status, to)) {
      throw new IllegalTransitionError(order.status, to);
    }

    if (to === "FULFILLED") {
      for (const line of order.lineItems) {
        inventoryRepository.fulfill(db, line.productId, line.quantity);
      }
    } else if (to === "CANCELLED") {
      for (const line of order.lineItems) {
        inventoryRepository.release(db, line.productId, line.quantity);
      }
    }

    orderRepository.updateStatus(db, orderId, to);
  });

  run();

  const updated = orderRepository.getOrderById(db, orderId);
  if (!updated) {
    // Unreachable: it existed inside the transaction we just committed.
    throw new Error(`order ${orderId} missing after transition`);
  }
  return updated;
}

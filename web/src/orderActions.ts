import type { OrderStatus } from "./api/types";

export interface OrderAction {
  label: string;
  to: OrderStatus;
}

// Mirrors the server's state machine to decide which buttons to show for an
// order. The server stays the source of truth — an illegal transition still
// 409s — so this is purely a UI affordance, not the guard.
const ACTIONS: Record<OrderStatus, OrderAction[]> = {
  PLACED: [
    { label: "Start picking", to: "PICKING" },
    { label: "Cancel", to: "CANCELLED" },
  ],
  PICKING: [
    { label: "Pack", to: "PACKED" },
    { label: "Cancel", to: "CANCELLED" },
  ],
  PACKED: [
    { label: "Fulfill", to: "FULFILLED" },
    { label: "Cancel", to: "CANCELLED" },
  ],
  FULFILLED: [],
  CANCELLED: [],
};

export function nextActions(status: OrderStatus): OrderAction[] {
  return ACTIONS[status];
}

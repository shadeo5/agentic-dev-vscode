import type { OrderStatus } from "./types";

// Single source of truth for legal order transitions (PLAN §4 / SPEC). The
// fulfillment service asks this module and never hardcodes a transition check.
//
// PLACED → PICKING → PACKED → FULFILLED (terminal). Any non-terminal order may
// be CANCELLED right up until it ships; FULFILLED and CANCELLED are terminal.
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PLACED: ["PICKING", "CANCELLED"],
  PICKING: ["PACKED", "CANCELLED"],
  PACKED: ["FULFILLED", "CANCELLED"],
  FULFILLED: [],
  CANCELLED: [],
};

// True iff `to` is a legal next state from `from`.
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

// The legal next states from `from` (empty for terminal states).
export function legalNextStates(from: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[from];
}

// A status is terminal when no transition leads out of it.
export function isTerminal(status: OrderStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

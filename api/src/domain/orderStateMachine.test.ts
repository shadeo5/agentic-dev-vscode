import { describe, it, expect } from "vitest";
import {
  canTransition,
  legalNextStates,
  isTerminal,
} from "./orderStateMachine";
import type { OrderStatus } from "./types";

const ALL_STATES: OrderStatus[] = [
  "PLACED",
  "PICKING",
  "PACKED",
  "FULFILLED",
  "CANCELLED",
];

// The expected legal transitions, written INDEPENDENTLY of the implementation
// so the test is a real specification (not a mirror of the code). Any
// non-terminal order may be CANCELLED until it ships; FULFILLED and CANCELLED
// are terminal.
const EXPECTED_LEGAL: Record<OrderStatus, OrderStatus[]> = {
  PLACED: ["PICKING", "CANCELLED"],
  PICKING: ["PACKED", "CANCELLED"],
  PACKED: ["FULFILLED", "CANCELLED"],
  FULFILLED: [],
  CANCELLED: [],
};

describe("orderStateMachine", () => {
  // Exhaustive: all 25 (from, to) pairs checked against the expected table —
  // this leaves no transition implicit.
  for (const from of ALL_STATES) {
    for (const to of ALL_STATES) {
      const legal = EXPECTED_LEGAL[from].includes(to);
      it(`${from} -> ${to} is ${legal ? "legal" : "illegal"}`, () => {
        expect(canTransition(from, to)).toBe(legal);
      });
    }
  }

  it("legalNextStates returns exactly the allowed targets for each state", () => {
    for (const from of ALL_STATES) {
      expect([...legalNextStates(from)].sort()).toEqual(
        [...EXPECTED_LEGAL[from]].sort(),
      );
    }
  });

  it("treats FULFILLED and CANCELLED as terminal, others as non-terminal", () => {
    expect(isTerminal("FULFILLED")).toBe(true);
    expect(isTerminal("CANCELLED")).toBe(true);
    expect(isTerminal("PLACED")).toBe(false);
    expect(isTerminal("PICKING")).toBe(false);
    expect(isTerminal("PACKED")).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import {
  hasSufficientStock,
  checkOrderStock,
  applyDecrement,
} from "./inventory";

// Slice 3 (M2a): pure inventory math. No db, no HTTP — plain values in,
// plain values/throws out. This is the most heavily tested code in the repo
// because it's the only place stock arithmetic can go wrong.

describe("hasSufficientStock", () => {
  it("is true when on-hand exceeds requested", () => {
    expect(hasSufficientStock(10, 3)).toBe(true);
  });

  it("is true at the exact boundary (on-hand === requested)", () => {
    expect(hasSufficientStock(5, 5)).toBe(true);
  });

  it("is false when requested exceeds on-hand", () => {
    expect(hasSufficientStock(2, 5)).toBe(false);
  });

  it("is true for a zero request", () => {
    expect(hasSufficientStock(0, 0)).toBe(true);
  });
});

describe("checkOrderStock", () => {
  it("returns no shortfalls when every line is satisfiable", () => {
    const stock = new Map([
      [1, 10],
      [2, 5],
    ]);
    const result = checkOrderStock(
      [
        { productId: 1, requested: 4 },
        { productId: 2, requested: 5 }, // exact boundary
      ],
      stock,
    );
    expect(result).toEqual([]);
  });

  it("reports only the short lines, with shortBy and available", () => {
    const stock = new Map([
      [1, 10],
      [2, 3],
    ]);
    const result = checkOrderStock(
      [
        { productId: 1, requested: 4 }, // ok
        { productId: 2, requested: 7 }, // short by 4
      ],
      stock,
    );
    expect(result).toEqual([
      { productId: 2, requested: 7, available: 3, shortBy: 4 },
    ]);
  });

  it("treats a product missing from stock levels as 0 available", () => {
    const result = checkOrderStock(
      [{ productId: 99, requested: 2 }],
      new Map(),
    );
    expect(result).toEqual([
      { productId: 99, requested: 2, available: 0, shortBy: 2 },
    ]);
  });

  it("can report multiple shortfalls in one order", () => {
    const stock = new Map([
      [1, 1],
      [2, 0],
    ]);
    const result = checkOrderStock(
      [
        { productId: 1, requested: 3 },
        { productId: 2, requested: 1 },
      ],
      stock,
    );
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ productId: 1, requested: 3, available: 1, shortBy: 2 });
    expect(result).toContainEqual({ productId: 2, requested: 1, available: 0, shortBy: 1 });
  });
});

describe("applyDecrement", () => {
  it("subtracts the quantity from on-hand", () => {
    expect(applyDecrement(10, 3)).toBe(7);
  });

  it("allows decrementing to exactly zero", () => {
    expect(applyDecrement(5, 5)).toBe(0);
  });

  it("leaves stock unchanged for a zero decrement", () => {
    expect(applyDecrement(5, 0)).toBe(5);
  });

  it("throws rather than going negative", () => {
    expect(() => applyDecrement(3, 5)).toThrow(/negative|insufficient/i);
  });

  it("throws on a negative quantity", () => {
    expect(() => applyDecrement(10, -1)).toThrow();
  });
});

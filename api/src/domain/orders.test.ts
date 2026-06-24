import { describe, it, expect } from "vitest";
import { consolidateLines } from "./orders";

// AC-4.6: line-item consolidation is pure order-shaping logic — same product
// listed twice becomes one line with summed quantity; distinct products and
// their first-appearance order are preserved.

describe("consolidateLines", () => {
  it("merges repeated products into one line, summing quantities", () => {
    expect(
      consolidateLines([
        { productId: 1, quantity: 2 },
        { productId: 1, quantity: 5 },
      ]),
    ).toEqual([{ productId: 1, quantity: 7 }]);
  });

  it("keeps distinct products separate, in first-appearance order", () => {
    expect(
      consolidateLines([
        { productId: 2, quantity: 1 },
        { productId: 1, quantity: 3 },
        { productId: 2, quantity: 4 },
      ]),
    ).toEqual([
      { productId: 2, quantity: 5 },
      { productId: 1, quantity: 3 },
    ]);
  });

  it("returns an empty array unchanged", () => {
    expect(consolidateLines([])).toEqual([]);
  });

  it("leaves a single line untouched", () => {
    expect(consolidateLines([{ productId: 9, quantity: 1 }])).toEqual([
      { productId: 9, quantity: 1 },
    ]);
  });
});

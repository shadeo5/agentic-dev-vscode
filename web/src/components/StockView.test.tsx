import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import StockView from "./StockView";
import { getProducts } from "../api/client";
import type { Product } from "../api/types";

vi.mock("../api/client", () => ({
  getProducts: vi.fn(),
  getHealth: vi.fn(),
}));

const mockGetProducts = vi.mocked(getProducts);

function product(over: Partial<Product> = {}): Product {
  return {
    id: 1,
    sku: "SKU-1",
    name: "Widget",
    description: "",
    priceCents: 1000,
    category: "tools",
    quantityOnHand: 5,
    quantityReserved: 3,
    available: 2,
    ...over,
  };
}

describe("StockView", () => {
  beforeEach(() => {
    mockGetProducts.mockReset();
  });

  it("shows a loading state initially", () => {
    mockGetProducts.mockReturnValue(new Promise<Product[]>(() => {}));
    render(<StockView />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("renders a row per product with its available stock", async () => {
    mockGetProducts.mockResolvedValue([
      product({ id: 1, name: "Widget", available: 2 }),
      product({ id: 2, sku: "SKU-2", name: "Gadget", available: 10 }),
    ]);
    render(<StockView />);

    await waitFor(() =>
      expect(screen.getByText("Widget")).toBeInTheDocument(),
    );
    expect(screen.getByText("Gadget")).toBeInTheDocument();
    expect(screen.getByTestId("available-1")).toHaveTextContent("2");
    expect(screen.getByTestId("available-2")).toHaveTextContent("10");
  });

  it("formats price as dollars", async () => {
    mockGetProducts.mockResolvedValue([product({ priceCents: 1499 })]);
    render(<StockView />);
    await waitFor(() =>
      expect(screen.getByText("$14.99")).toBeInTheDocument(),
    );
  });

  it("shows an error state when the request fails", async () => {
    mockGetProducts.mockRejectedValue(new Error("500 Internal Server Error"));
    render(<StockView />);
    await waitFor(() =>
      expect(screen.getByText(/couldn.t load|error/i)).toBeInTheDocument(),
    );
  });

  it("shows an empty state when there are no products", async () => {
    mockGetProducts.mockResolvedValue([]);
    render(<StockView />);
    await waitFor(() =>
      expect(screen.getByText(/no products/i)).toBeInTheDocument(),
    );
  });
});

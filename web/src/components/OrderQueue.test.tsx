import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import OrderQueue from "./OrderQueue";
import { getOrders, getProducts } from "../api/client";
import type { Order, Product } from "../api/types";

vi.mock("../api/client", () => ({
  getOrders: vi.fn(),
  getProducts: vi.fn(),
  getHealth: vi.fn(),
}));

const mockGetOrders = vi.mocked(getOrders);
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
    quantityReserved: 0,
    available: 5,
    ...over,
  };
}

function order(over: Partial<Order> = {}): Order {
  return {
    id: 1,
    status: "PLACED",
    customerName: "Ada",
    createdAt: "2026-06-25T10:00:00.000Z",
    lineItems: [{ productId: 1, quantity: 2, unitPriceCents: 1000 }],
    ...over,
  };
}

describe("OrderQueue", () => {
  beforeEach(() => {
    mockGetOrders.mockReset();
    mockGetProducts.mockReset();
    mockGetProducts.mockResolvedValue([
      product({ id: 1, name: "Widget" }),
      product({ id: 2, name: "Gadget" }),
    ]);
  });

  it("shows a loading state initially", () => {
    mockGetOrders.mockReturnValue(new Promise<Order[]>(() => {}));
    render(<OrderQueue />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("renders orders with customer, status, and line items by product name", async () => {
    mockGetOrders.mockResolvedValue([
      order({
        id: 7,
        customerName: "Ada",
        status: "PLACED",
        lineItems: [{ productId: 2, quantity: 3, unitPriceCents: 2500 }],
      }),
    ]);
    render(<OrderQueue />);

    await waitFor(() => expect(screen.getByText("Ada")).toBeInTheDocument());
    expect(screen.getByTestId("order-status-7")).toHaveTextContent("PLACED");
    // line item resolved to the product name (joined from the catalog) + qty
    expect(screen.getByText("Gadget")).toBeInTheDocument();
    expect(screen.getByTestId("qty-7-2")).toHaveTextContent("3");
  });

  it("filters by status when a filter is selected", async () => {
    mockGetOrders.mockImplementation((status?: string) =>
      Promise.resolve(
        status === "PICKING"
          ? [order({ id: 2, customerName: "Bo", status: "PICKING" })]
          : [
              order({ id: 1, customerName: "Ada", status: "PLACED" }),
              order({ id: 2, customerName: "Bo", status: "PICKING" }),
            ],
      ),
    );
    render(<OrderQueue />);

    await waitFor(() => expect(screen.getByText("Ada")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "PICKING" }));

    await waitFor(() =>
      expect(screen.queryByText("Ada")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Bo")).toBeInTheDocument();
    expect(mockGetOrders).toHaveBeenCalledWith("PICKING");
  });

  it("shows an empty state when there are no orders", async () => {
    mockGetOrders.mockResolvedValue([]);
    render(<OrderQueue />);
    await waitFor(() =>
      expect(screen.getByText(/no orders/i)).toBeInTheDocument(),
    );
  });

  it("shows an error state when the request fails", async () => {
    mockGetOrders.mockRejectedValue(new Error("500 Internal Server Error"));
    render(<OrderQueue />);
    await waitFor(() =>
      expect(screen.getByText(/couldn.t load|error/i)).toBeInTheDocument(),
    );
  });
});

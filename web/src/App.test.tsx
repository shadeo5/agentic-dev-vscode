import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import App from "./App";
import { getProducts, getHealth, getOrders } from "./api/client";

vi.mock("./api/client", () => ({
  getProducts: vi.fn(),
  getHealth: vi.fn(),
  getOrders: vi.fn(),
  transitionOrder: vi.fn(),
}));

describe("App", () => {
  beforeEach(() => {
    vi.mocked(getProducts).mockResolvedValue([]);
    vi.mocked(getHealth).mockResolvedValue({ ok: true });
    vi.mocked(getOrders).mockResolvedValue([]);
  });

  it("renders the dashboard heading", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "StoreFlow" }),
    ).toBeInTheDocument();
  });

  it("shows the stock view and the health badge", async () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: /stock/i }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("api-health")).toBeInTheDocument(),
    );
  });
});

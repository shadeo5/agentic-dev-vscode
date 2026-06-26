import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import App from "./App";
import { getProducts, getHealth } from "./api/client";

vi.mock("./api/client", () => ({
  getProducts: vi.fn(),
  getHealth: vi.fn(),
}));

describe("App", () => {
  beforeEach(() => {
    vi.mocked(getProducts).mockResolvedValue([]);
    vi.mocked(getHealth).mockResolvedValue({ ok: true });
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

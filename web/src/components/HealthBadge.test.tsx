import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import HealthBadge from "./HealthBadge";
import { getHealth } from "../api/client";

vi.mock("../api/client", () => ({
  getHealth: vi.fn(),
  getProducts: vi.fn(),
}));

const mockGetHealth = vi.mocked(getHealth);

describe("HealthBadge", () => {
  beforeEach(() => {
    mockGetHealth.mockReset();
  });

  it("reports 'ok' when the API is healthy", async () => {
    mockGetHealth.mockResolvedValue({ ok: true });
    render(<HealthBadge />);
    await waitFor(() =>
      expect(screen.getByTestId("api-health")).toHaveTextContent("ok"),
    );
  });

  it("reports 'down' when the health check fails", async () => {
    mockGetHealth.mockRejectedValue(new Error("network"));
    render(<HealthBadge />);
    await waitFor(() =>
      expect(screen.getByTestId("api-health")).toHaveTextContent("down"),
    );
  });
});

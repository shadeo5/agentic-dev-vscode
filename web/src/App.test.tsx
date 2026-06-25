import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import App from "./App";

function stubFetch(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ json: async () => body }),
  );
}

describe("App", () => {
  it("renders the dashboard heading", () => {
    stubFetch({ ok: true });
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "StoreFlow" }),
    ).toBeInTheDocument();
  });

  it("reports API status 'ok' when /api/health responds ok", async () => {
    stubFetch({ ok: true });
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId("api-health")).toHaveTextContent("ok");
    });
  });

  it("reports 'down' when the health check fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId("api-health")).toHaveTextContent("down");
    });
  });
});

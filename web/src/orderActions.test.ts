import { describe, it, expect } from "vitest";
import { nextActions } from "./orderActions";

// AC-M4.3.1 — mirrors the server state machine; cancel allowed through PACKED.
describe("nextActions", () => {
  it("PLACED → start picking / cancel", () => {
    expect(nextActions("PLACED")).toEqual([
      { label: "Start picking", to: "PICKING" },
      { label: "Cancel", to: "CANCELLED" },
    ]);
  });

  it("PICKING → pack / cancel", () => {
    expect(nextActions("PICKING")).toEqual([
      { label: "Pack", to: "PACKED" },
      { label: "Cancel", to: "CANCELLED" },
    ]);
  });

  it("PACKED → fulfill / cancel", () => {
    expect(nextActions("PACKED")).toEqual([
      { label: "Fulfill", to: "FULFILLED" },
      { label: "Cancel", to: "CANCELLED" },
    ]);
  });

  it("terminal states have no actions", () => {
    expect(nextActions("FULFILLED")).toEqual([]);
    expect(nextActions("CANCELLED")).toEqual([]);
  });
});

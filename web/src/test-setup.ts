import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Vitest globals are off, so RTL's auto-cleanup doesn't run — do it here.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

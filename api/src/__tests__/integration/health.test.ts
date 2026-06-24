import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../app";

// Slice 0: prove the whole toolchain works end-to-end with the smallest
// possible behavior. We import the app (no real server/port) and drive it
// with supertest — the pattern every later integration test will reuse.
describe("GET /health", () => {
  it("returns 200 and { ok: true }", async () => {
    const response = await request(createApp()).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});

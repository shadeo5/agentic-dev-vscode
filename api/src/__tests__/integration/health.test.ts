import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../app";
import { openDatabase } from "../../db/connection";

// Slice 0: prove the whole toolchain works end-to-end with the smallest
// possible behavior. We import the app (no real server/port) and drive it
// with supertest — the pattern every later integration test will reuse.
// createApp now requires a db handle; /health doesn't use it, so a bare
// in-memory connection is enough.
describe("GET /health", () => {
  it("returns 200 and { ok: true }", async () => {
    const response = await request(createApp(openDatabase())).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});

import express, { type Express } from "express";

// Builds the Express app WITHOUT starting a server (no .listen here).
// Keeping construction separate from binding a port is what lets tests
// import and exercise the app in-process. Every route gets wired up here.
export function createApp(): Express {
  const app = express();
  app.use(express.json());

  // Liveness check — the smallest real endpoint. Later slices add /products,
  // /orders, etc., each behind its own router.
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}

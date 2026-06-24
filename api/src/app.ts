import express, { type Express } from "express";
import type { Db } from "./db/connection";
import { catalogRoutes } from "./routes/catalogRoutes";

// Builds the Express app WITHOUT starting a server (no .listen here).
// Keeping construction separate from binding a port is what lets tests
// import and exercise the app in-process. The db handle is injected so tests
// can pass a fresh :memory: db and the dev server passes a file-backed one.
export function createApp(db: Db): Express {
  const app = express();
  app.use(express.json());

  // Liveness check — the smallest real endpoint.
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  // Catalog read (M1): GET /products, GET /products/:id.
  app.use(catalogRoutes(db));

  return app;
}

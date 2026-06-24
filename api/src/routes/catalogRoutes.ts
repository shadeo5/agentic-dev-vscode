import { Router } from "express";
import { z } from "zod";
import type { Db } from "../db/connection";
import {
  listProducts,
  getProductById,
} from "../repositories/productRepository";

// :id must be a positive integer. z.coerce turns the string path param into a
// number, then validates it. A non-numeric or non-positive id is a *malformed*
// request → 400; a well-formed id that simply isn't in the db → 404. Keeping
// these distinct is the boundary-validation principle from CLAUDE.md.
const idParam = z.coerce.number().int().positive();

// Thin HTTP layer: parse/validate input, call the repository, map to a status.
// No SQL here; no business logic (catalog read has none).
export function catalogRoutes(db: Db): Router {
  const router = Router();

  router.get("/products", (_req, res) => {
    res.json(listProducts(db));
  });

  router.get("/products/:id", (req, res) => {
    const parsed = idParam.safeParse(req.params.id);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid product id" });
      return;
    }

    const product = getProductById(db, parsed.data);
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    res.json(product);
  });

  return router;
}

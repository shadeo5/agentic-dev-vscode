import { Router } from "express";
import { z } from "zod";
import type { Db } from "../db/connection";
import { placeOrder } from "../services/orderService";
import { AppError } from "../http/errors";

// Validate the placement body at the boundary. A failure here is a malformed
// request → 400, distinct from the service's 404/409 conflicts.
const placeOrderSchema = z.object({
  customerName: z.string().trim().min(1),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
});

export function orderRoutes(db: Db): Router {
  const router = Router();

  router.post("/orders", (req, res) => {
    const parsed = placeOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid order", details: parsed.error.issues });
      return;
    }

    try {
      const order = placeOrder(db, parsed.data);
      res.status(201).json(order);
    } catch (err) {
      // Typed domain errors carry their own status; anything else is a bug and
      // should surface as a 500 (re-thrown to Express).
      if (err instanceof AppError) {
        res.status(err.status).json({ error: err.message, details: err.details });
        return;
      }
      throw err;
    }
  });

  return router;
}

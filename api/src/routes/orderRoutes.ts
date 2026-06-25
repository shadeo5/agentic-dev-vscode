import { Router } from "express";
import { z } from "zod";
import type { Db } from "../db/connection";
import { placeOrder } from "../services/orderService";
import { transition } from "../services/fulfillmentService";
import { listOrders, getOrderById } from "../repositories/orderRepository";
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

// The order-status vocabulary — reused to validate `{ to }` and `?status=`.
const orderStatusSchema = z.enum([
  "PLACED",
  "PICKING",
  "PACKED",
  "FULFILLED",
  "CANCELLED",
]);
const transitionBodySchema = z.object({ to: orderStatusSchema });
const listQuerySchema = z.object({ status: orderStatusSchema.optional() });
const idParam = z.coerce.number().int().positive();

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

  // The fulfillment queue: all orders, optionally filtered by status.
  router.get("/orders", (req, res) => {
    const query = listQuerySchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: "Invalid status filter" });
      return;
    }
    res.json(listOrders(db, query.data.status));
  });

  router.get("/orders/:id", (req, res) => {
    const id = idParam.safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ error: "Invalid order id" });
      return;
    }
    const order = getOrderById(db, id.data);
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.json(order);
  });

  // The single funnel for status changes (guarded by the state machine).
  router.post("/orders/:id/transition", (req, res) => {
    const id = idParam.safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ error: "Invalid order id" });
      return;
    }
    const body = transitionBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid transition", details: body.error.issues });
      return;
    }

    try {
      const order = transition(db, id.data, body.data.to);
      res.json(order);
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.status).json({ error: err.message, details: err.details });
        return;
      }
      throw err;
    }
  });

  return router;
}

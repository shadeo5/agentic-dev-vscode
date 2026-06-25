import { describe, it, expect } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../app";
import { openDatabase, type Db } from "../../db/connection";
import { migrate } from "../../db/migrate";

// Slice 6: fulfillment transitions. Tests trace to ACCEPTANCE.md AC-6.x.
// Orders are set up via the real POST /orders flow (so reservations are real),
// then driven through the state machine.

function freshDb(): Db {
  const db = openDatabase();
  migrate(db);
  return db;
}

function addProduct(
  db: Db,
  opts: { sku: string; priceCents: number; onHand: number },
): number {
  const info = db
    .prepare(
      "INSERT INTO products (sku, name, price_cents, category) VALUES (?, ?, ?, ?)",
    )
    .run(opts.sku, opts.sku, opts.priceCents, "cat");
  const id = Number(info.lastInsertRowid);
  db.prepare(
    "INSERT INTO inventory_items (product_id, quantity_on_hand, quantity_reserved) VALUES (?, ?, 0)",
  ).run(id, opts.onHand);
  return id;
}

function stockOf(db: Db, productId: number): { onHand: number; reserved: number } {
  return db
    .prepare(
      "SELECT quantity_on_hand AS onHand, quantity_reserved AS reserved FROM inventory_items WHERE product_id = ?",
    )
    .get(productId) as { onHand: number; reserved: number };
}

function statusOf(db: Db, orderId: number): string {
  return (
    db.prepare("SELECT status FROM orders WHERE id = ?").get(orderId) as {
      status: string;
    }
  ).status;
}

async function placeOrder(
  app: Express,
  productId: number,
  quantity: number,
): Promise<number> {
  const res = await request(app)
    .post("/orders")
    .send({ customerName: "Ada", items: [{ productId, quantity }] });
  return res.body.id as number;
}

function transition(app: Express, orderId: number, to: string) {
  return request(app).post(`/orders/${orderId}/transition`).send({ to });
}

// Advance an order through a list of states, asserting each succeeds.
async function advance(app: Express, orderId: number, states: string[]) {
  for (const to of states) {
    const res = await transition(app, orderId, to);
    expect(res.status).toBe(200);
  }
}

describe("POST /orders/:id/transition — legal moves", () => {
  it("AC-6.1: PLACED → PICKING (200, no inventory effect)", async () => {
    const db = freshDb();
    const app = createApp(db);
    const pid = addProduct(db, { sku: "X", priceCents: 100, onHand: 5 });
    const oid = await placeOrder(app, pid, 3);

    const res = await transition(app, oid, "PICKING");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("PICKING");
    expect(stockOf(db, pid)).toEqual({ onHand: 5, reserved: 3 }); // unchanged
    db.close();
  });

  it("AC-6.2: PICKING → PACKED (200, no inventory effect)", async () => {
    const db = freshDb();
    const app = createApp(db);
    const pid = addProduct(db, { sku: "X", priceCents: 100, onHand: 5 });
    const oid = await placeOrder(app, pid, 3);
    await advance(app, oid, ["PICKING"]);

    const res = await transition(app, oid, "PACKED");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("PACKED");
    expect(stockOf(db, pid)).toEqual({ onHand: 5, reserved: 3 });
    db.close();
  });
});

describe("POST /orders/:id/transition — FULFILLED decrements", () => {
  it("AC-6.3: FULFILLED decrements on-hand AND releases reservation", async () => {
    const db = freshDb();
    const app = createApp(db);
    const pid = addProduct(db, { sku: "X", priceCents: 100, onHand: 5 });
    const oid = await placeOrder(app, pid, 3);
    await advance(app, oid, ["PICKING", "PACKED"]);

    const res = await transition(app, oid, "FULFILLED");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("FULFILLED");
    // on_hand 5-3=2, reserved 3-3=0
    expect(stockOf(db, pid)).toEqual({ onHand: 2, reserved: 0 });
    db.close();
  });

  it("AC-6.4: decrement-exactly-once — re-fulfilling is 409, inventory unchanged", async () => {
    const db = freshDb();
    const app = createApp(db);
    const pid = addProduct(db, { sku: "X", priceCents: 100, onHand: 5 });
    const oid = await placeOrder(app, pid, 3);
    await advance(app, oid, ["PICKING", "PACKED", "FULFILLED"]);

    const res = await transition(app, oid, "FULFILLED");

    expect(res.status).toBe(409);
    expect(stockOf(db, pid)).toEqual({ onHand: 2, reserved: 0 }); // no double decrement
    db.close();
  });
});

describe("POST /orders/:id/transition — CANCELLED releases reservation", () => {
  it("AC-6.5: cancel a PLACED order releases reservation, leaves on-hand", async () => {
    const db = freshDb();
    const app = createApp(db);
    const pid = addProduct(db, { sku: "X", priceCents: 100, onHand: 5 });
    const oid = await placeOrder(app, pid, 3);

    const res = await transition(app, oid, "CANCELLED");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CANCELLED");
    expect(stockOf(db, pid)).toEqual({ onHand: 5, reserved: 0 }); // released, on-hand intact
    db.close();
  });

  it("AC-6.6: cancel is allowed from PACKED and releases reservation", async () => {
    const db = freshDb();
    const app = createApp(db);
    const pid = addProduct(db, { sku: "X", priceCents: 100, onHand: 5 });
    const oid = await placeOrder(app, pid, 3);
    await advance(app, oid, ["PICKING", "PACKED"]);

    const res = await transition(app, oid, "CANCELLED");

    expect(res.status).toBe(200);
    expect(stockOf(db, pid)).toEqual({ onHand: 5, reserved: 0 });
    db.close();
  });
});

describe("POST /orders/:id/transition — illegal / not found / malformed", () => {
  it("AC-6.7: illegal skip (PLACED → FULFILLED) → 409, nothing changes", async () => {
    const db = freshDb();
    const app = createApp(db);
    const pid = addProduct(db, { sku: "X", priceCents: 100, onHand: 5 });
    const oid = await placeOrder(app, pid, 3);

    const res = await transition(app, oid, "FULFILLED");

    expect(res.status).toBe(409);
    expect(statusOf(db, oid)).toBe("PLACED"); // unchanged
    expect(stockOf(db, pid)).toEqual({ onHand: 5, reserved: 3 }); // unchanged
    db.close();
  });

  it("AC-6.8: out of a terminal state → 409", async () => {
    const db = freshDb();
    const app = createApp(db);
    const pid = addProduct(db, { sku: "X", priceCents: 100, onHand: 5 });
    const oid = await placeOrder(app, pid, 1);
    await advance(app, oid, ["CANCELLED"]); // terminal

    expect((await transition(app, oid, "PICKING")).status).toBe(409);
    db.close();
  });

  it("AC-6.9: unknown order id → 404", async () => {
    const db = freshDb();
    const app = createApp(db);
    expect((await transition(app, 999, "PICKING")).status).toBe(404);
    db.close();
  });

  it("AC-6.10: missing or invalid `to` → 400", async () => {
    const db = freshDb();
    const app = createApp(db);
    const pid = addProduct(db, { sku: "X", priceCents: 100, onHand: 5 });
    const oid = await placeOrder(app, pid, 1);

    expect((await request(app).post(`/orders/${oid}/transition`).send({})).status).toBe(400);
    expect((await transition(app, oid, "BOGUS")).status).toBe(400);
    db.close();
  });

  it("AC-6.11: malformed :id → 400", async () => {
    const db = freshDb();
    const app = createApp(db);
    expect((await transition(app, "abc" as unknown as number, "PICKING")).status).toBe(400);
    db.close();
  });
});

describe("GET /orders & GET /orders/:id", () => {
  it("AC-6.13/6.14: lists orders with line items, filterable by status", async () => {
    const db = freshDb();
    const app = createApp(db);
    const pid = addProduct(db, { sku: "X", priceCents: 100, onHand: 20 });
    const o1 = await placeOrder(app, pid, 1);
    const o2 = await placeOrder(app, pid, 2);
    await advance(app, o2, ["PICKING"]);

    const all = await request(app).get("/orders");
    expect(all.status).toBe(200);
    expect(all.body).toHaveLength(2);
    expect(all.body[0].lineItems).toBeDefined();

    const placed = await request(app).get("/orders?status=PLACED");
    expect(placed.body.map((o: { id: number }) => o.id)).toEqual([o1]);

    const picking = await request(app).get("/orders?status=PICKING");
    expect(picking.body.map((o: { id: number }) => o.id)).toEqual([o2]);
    db.close();
  });

  it("AC-6.15: invalid ?status= → 400", async () => {
    const db = freshDb();
    const app = createApp(db);
    expect((await request(app).get("/orders?status=BOGUS")).status).toBe(400);
    db.close();
  });

  it("AC-6.16: detail returns order with line items; 404 unknown; 400 non-numeric", async () => {
    const db = freshDb();
    const app = createApp(db);
    const pid = addProduct(db, { sku: "X", priceCents: 100, onHand: 5 });
    const oid = await placeOrder(app, pid, 2);

    const ok = await request(app).get(`/orders/${oid}`);
    expect(ok.status).toBe(200);
    expect(ok.body.lineItems).toEqual([
      { productId: pid, quantity: 2, unitPriceCents: 100 },
    ]);

    expect((await request(app).get("/orders/999")).status).toBe(404);
    expect((await request(app).get("/orders/abc")).status).toBe(400);
    db.close();
  });
});

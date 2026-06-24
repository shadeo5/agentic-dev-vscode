import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../app";
import { openDatabase, type Db } from "../../db/connection";
import { migrate } from "../../db/migrate";

// Slice 4: order placement. Each test builds a fresh migrated :memory: db with
// its own fixtures. Criteria traced to ACCEPTANCE.md (AC-4.x).

function freshDb(): Db {
  const db = openDatabase();
  migrate(db);
  return db;
}

function addProduct(
  db: Db,
  opts: { sku: string; priceCents: number; onHand: number; reserved?: number },
): number {
  const info = db
    .prepare(
      "INSERT INTO products (sku, name, price_cents, category) VALUES (?, ?, ?, ?)",
    )
    .run(opts.sku, opts.sku, opts.priceCents, "cat");
  const id = Number(info.lastInsertRowid);
  db.prepare(
    "INSERT INTO inventory_items (product_id, quantity_on_hand, quantity_reserved) VALUES (?, ?, ?)",
  ).run(id, opts.onHand, opts.reserved ?? 0);
  return id;
}

function stockOf(db: Db, productId: number): { onHand: number; reserved: number } {
  return db
    .prepare(
      "SELECT quantity_on_hand AS onHand, quantity_reserved AS reserved FROM inventory_items WHERE product_id = ?",
    )
    .get(productId) as { onHand: number; reserved: number };
}

function orderCount(db: Db): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM orders").get() as { n: number }).n;
}

describe("POST /orders — happy path & reservation", () => {
  it("AC-4.1/4.3/4.4: 201, reserves stock, leaves on-hand, snapshots price, ISO createdAt", async () => {
    const db = freshDb();
    const id = addProduct(db, { sku: "X", priceCents: 1000, onHand: 5 });

    const res = await request(createApp(db))
      .post("/orders")
      .send({ customerName: "Ada", items: [{ productId: id, quantity: 3 }] });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PLACED");
    expect(res.body.customerName).toBe("Ada");
    expect(res.body.createdAt).toBe(new Date(res.body.createdAt).toISOString());
    expect(res.body.lineItems).toEqual([
      { productId: id, quantity: 3, unitPriceCents: 1000 },
    ]);
    // reserved up by 3; on-hand untouched.
    expect(stockOf(db, id)).toEqual({ onHand: 5, reserved: 3 });
    db.close();
  });

  it("AC-4.2: places a multi-product order, reserving each", async () => {
    const db = freshDb();
    const a = addProduct(db, { sku: "A", priceCents: 100, onHand: 10 });
    const b = addProduct(db, { sku: "B", priceCents: 200, onHand: 10 });

    const res = await request(createApp(db))
      .post("/orders")
      .send({
        customerName: "Bo",
        items: [
          { productId: a, quantity: 2 },
          { productId: b, quantity: 4 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.lineItems).toHaveLength(2);
    expect(stockOf(db, a).reserved).toBe(2);
    expect(stockOf(db, b).reserved).toBe(4);
    db.close();
  });

  it("AC-4.5: exact-boundary order succeeds and brings available to 0", async () => {
    const db = freshDb();
    const id = addProduct(db, { sku: "X", priceCents: 100, onHand: 5 });

    const res = await request(createApp(db))
      .post("/orders")
      .send({ customerName: "Ada", items: [{ productId: id, quantity: 5 }] });

    expect(res.status).toBe(201);
    expect(stockOf(db, id)).toEqual({ onHand: 5, reserved: 5 }); // available 0
    db.close();
  });
});

describe("POST /orders — consolidation", () => {
  it("AC-4.7: same product twice (2 and 5) becomes one line of 7", async () => {
    const db = freshDb();
    const id = addProduct(db, { sku: "X", priceCents: 100, onHand: 10 });

    const res = await request(createApp(db))
      .post("/orders")
      .send({
        customerName: "Ada",
        items: [
          { productId: id, quantity: 2 },
          { productId: id, quantity: 5 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.lineItems).toEqual([
      { productId: id, quantity: 7, unitPriceCents: 100 },
    ]);
    expect(stockOf(db, id).reserved).toBe(7);
    db.close();
  });

  it("AC-4.19: consolidation happens before the stock check (3+3 of 5 → 409)", async () => {
    const db = freshDb();
    const id = addProduct(db, { sku: "X", priceCents: 100, onHand: 5 });

    const res = await request(createApp(db))
      .post("/orders")
      .send({
        customerName: "Ada",
        items: [
          { productId: id, quantity: 3 },
          { productId: id, quantity: 3 },
        ],
      });

    expect(res.status).toBe(409);
    expect(stockOf(db, id).reserved).toBe(0); // rolled back
    expect(orderCount(db)).toBe(0);
    db.close();
  });
});

describe("POST /orders — oversell prevention & insufficient stock", () => {
  it("AC-4.9: fully-reserved stock → 409 with a precise shortfall", async () => {
    const db = freshDb();
    const id = addProduct(db, { sku: "X", priceCents: 100, onHand: 5, reserved: 5 });

    const res = await request(createApp(db))
      .post("/orders")
      .send({ customerName: "Ada", items: [{ productId: id, quantity: 1 }] });

    expect(res.status).toBe(409);
    expect(res.body.details).toContainEqual({
      productId: id,
      requested: 1,
      available: 0,
      shortBy: 1,
    });
    db.close();
  });

  it("AC-4.11: ordering more than available → 409 and nothing is written", async () => {
    const db = freshDb();
    const id = addProduct(db, { sku: "X", priceCents: 100, onHand: 2 });

    const res = await request(createApp(db))
      .post("/orders")
      .send({ customerName: "Ada", items: [{ productId: id, quantity: 5 }] });

    expect(res.status).toBe(409);
    expect(stockOf(db, id).reserved).toBe(0);
    expect(orderCount(db)).toBe(0);
    db.close();
  });

  it("AC-4.12: one short product rolls back the whole order (in-stock one not reserved)", async () => {
    const db = freshDb();
    const a = addProduct(db, { sku: "A", priceCents: 100, onHand: 10 });
    const b = addProduct(db, { sku: "B", priceCents: 100, onHand: 1 });

    const res = await request(createApp(db))
      .post("/orders")
      .send({
        customerName: "Ada",
        items: [
          { productId: a, quantity: 2 },
          { productId: b, quantity: 5 },
        ],
      });

    expect(res.status).toBe(409);
    expect(stockOf(db, a).reserved).toBe(0); // not reserved despite being in stock
    expect(orderCount(db)).toBe(0);
    db.close();
  });
});

describe("POST /orders — unknown product & malformed input", () => {
  it("AC-4.13: unknown product → 404 and nothing written", async () => {
    const db = freshDb();
    const res = await request(createApp(db))
      .post("/orders")
      .send({ customerName: "Ada", items: [{ productId: 999, quantity: 1 }] });

    expect(res.status).toBe(404);
    expect(orderCount(db)).toBe(0);
    db.close();
  });

  it("AC-4.14: missing/blank customerName → 400", async () => {
    const db = freshDb();
    const id = addProduct(db, { sku: "X", priceCents: 100, onHand: 5 });
    const res = await request(createApp(db))
      .post("/orders")
      .send({ customerName: "  ", items: [{ productId: id, quantity: 1 }] });
    expect(res.status).toBe(400);
    db.close();
  });

  it("AC-4.15: empty items → 400", async () => {
    const db = freshDb();
    const res = await request(createApp(db))
      .post("/orders")
      .send({ customerName: "Ada", items: [] });
    expect(res.status).toBe(400);
    db.close();
  });

  it("AC-4.16: quantity <= 0 → 400", async () => {
    const db = freshDb();
    const id = addProduct(db, { sku: "X", priceCents: 100, onHand: 5 });
    const res = await request(createApp(db))
      .post("/orders")
      .send({ customerName: "Ada", items: [{ productId: id, quantity: 0 }] });
    expect(res.status).toBe(400);
    db.close();
  });

  it("AC-4.17: missing/non-integer productId → 400", async () => {
    const db = freshDb();
    const res = await request(createApp(db))
      .post("/orders")
      .send({ customerName: "Ada", items: [{ quantity: 1 }] });
    expect(res.status).toBe(400);
    db.close();
  });
});

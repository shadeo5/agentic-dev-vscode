import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../app";
import { openDatabase, type Db } from "../../db/connection";
import { migrate } from "../../db/migrate";

// Slice 2: catalog read. Each test builds a fresh migrated :memory: db and
// inserts its own fixtures — never the dev seed (CLAUDE.md guardrail).

function freshDb(): Db {
  const db = openDatabase();
  migrate(db);
  return db;
}

interface Fixture {
  sku: string;
  name: string;
  description?: string;
  priceCents: number;
  category: string;
  quantityOnHand: number;
  quantityReserved?: number;
}

function insertProduct(db: Db, p: Fixture): number {
  const info = db
    .prepare(
      "INSERT INTO products (sku, name, description, price_cents, category) VALUES (?, ?, ?, ?, ?)",
    )
    .run(p.sku, p.name, p.description ?? "", p.priceCents, p.category);
  const id = Number(info.lastInsertRowid);
  db.prepare(
    "INSERT INTO inventory_items (product_id, quantity_on_hand, quantity_reserved) VALUES (?, ?, ?)",
  ).run(id, p.quantityOnHand, p.quantityReserved ?? 0);
  return id;
}

describe("GET /products", () => {
  it("returns 200 and all products with current stock", async () => {
    const db = freshDb();
    insertProduct(db, { sku: "SKU-1", name: "Widget", priceCents: 1000, category: "tools", quantityOnHand: 5 });
    insertProduct(db, { sku: "SKU-2", name: "Gadget", priceCents: 2500, category: "tools", quantityOnHand: 0 });

    const res = await request(createApp(db)).get("/products");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body).toContainEqual(
      expect.objectContaining({
        sku: "SKU-1",
        name: "Widget",
        priceCents: 1000,
        category: "tools",
        quantityOnHand: 5,
        quantityReserved: 0,
        available: 5,
      }),
    );
    db.close();
  });

  it("returns 200 and an empty array when there are no products", async () => {
    const db = freshDb();
    const res = await request(createApp(db)).get("/products");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    db.close();
  });
});

describe("GET /products/:id", () => {
  it("returns 200 and the single product with stock", async () => {
    const db = freshDb();
    const id = insertProduct(db, {
      sku: "SKU-1",
      name: "Widget",
      description: "A widget",
      priceCents: 1000,
      category: "tools",
      quantityOnHand: 5,
    });

    const res = await request(createApp(db)).get(`/products/${id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id,
      sku: "SKU-1",
      name: "Widget",
      description: "A widget",
      priceCents: 1000,
      category: "tools",
      quantityOnHand: 5,
      quantityReserved: 0,
      available: 5,
    });
    db.close();
  });

  it("reports available as on-hand minus reserved", async () => {
    const db = freshDb();
    const id = insertProduct(db, {
      sku: "SKU-1",
      name: "Widget",
      priceCents: 1000,
      category: "tools",
      quantityOnHand: 5,
      quantityReserved: 3,
    });

    const res = await request(createApp(db)).get(`/products/${id}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      quantityOnHand: 5,
      quantityReserved: 3,
      available: 2,
    });
    db.close();
  });

  it("returns 404 for a well-formed but unknown id", async () => {
    const db = freshDb();
    const res = await request(createApp(db)).get("/products/999");
    expect(res.status).toBe(404);
    db.close();
  });

  it("returns 400 for a malformed (non-numeric) id", async () => {
    const db = freshDb();
    const res = await request(createApp(db)).get("/products/abc");
    expect(res.status).toBe(400);
    db.close();
  });
});

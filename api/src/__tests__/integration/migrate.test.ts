import { describe, it, expect } from "vitest";
import { openDatabase } from "../../db/connection";
import { migrate } from "../../db/migrate";

// Slice 1: prove the schema is the source of truth and that the constraints
// — not application code — are what protect inventory correctness. Each test
// builds a fresh in-memory db so nothing leaks between cases (and we never
// touch the dev seed, per the CLAUDE.md guardrail).

describe("db migration", () => {
  it("creates exactly the four tables in a fresh :memory: database", () => {
    const db = openDatabase();
    migrate(db);

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all()
      .map((row) => (row as { name: string }).name);

    expect(tables).toEqual([
      "inventory_items",
      "order_line_items",
      "orders",
      "products",
    ]);

    db.close();
  });

  it("rejects negative stock via the quantity_on_hand CHECK constraint", () => {
    const db = openDatabase();
    migrate(db);
    db.prepare(
      "INSERT INTO products (sku, name, price_cents, category) VALUES (?, ?, ?, ?)",
    ).run("SKU-1", "Widget", 1000, "tools");

    // The whole point of the slice: the database refuses to record negative
    // stock even if buggy code asks it to.
    expect(() =>
      db
        .prepare(
          "INSERT INTO inventory_items (product_id, quantity_on_hand) VALUES (?, ?)",
        )
        .run(1, -5),
    ).toThrow(/CHECK constraint failed/);

    db.close();
  });

  it("enforces foreign keys (rejects an orphan order line item)", () => {
    const db = openDatabase();
    migrate(db);

    // FK enforcement only happens because connection.ts sets
    // PRAGMA foreign_keys = ON; without it SQLite would silently accept this.
    expect(() =>
      db
        .prepare(
          "INSERT INTO order_line_items (order_id, product_id, quantity, unit_price_cents) VALUES (?, ?, ?, ?)",
        )
        .run(999, 999, 1, 1000),
    ).toThrow(/FOREIGN KEY constraint failed/);

    db.close();
  });
});

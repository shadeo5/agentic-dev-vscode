import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { openDatabase, type Db } from "./connection";
import { migrate } from "./migrate";

// Dev-only seed data. NEVER used by tests — integration tests build their own
// fixtures (CLAUDE.md guardrail). This just gives the dev server a small,
// realistic catalog (including a 0-stock item and a below-threshold item) to
// exercise the endpoints by hand.

interface SeedProduct {
  sku: string;
  name: string;
  description: string;
  priceCents: number;
  category: string;
  quantityOnHand: number;
  reorderThreshold: number;
}

const PRODUCTS: SeedProduct[] = [
  { sku: "TOOL-HAMMER", name: "Claw Hammer", description: "16oz steel claw hammer", priceCents: 1499, category: "tools", quantityOnHand: 24, reorderThreshold: 5 },
  { sku: "TOOL-DRIVER", name: "Screwdriver Set", description: "6-piece precision set", priceCents: 2199, category: "tools", quantityOnHand: 12, reorderThreshold: 4 },
  { sku: "PAINT-WHITE-1G", name: "White Paint (1gal)", description: "Matte interior, 1 gallon", priceCents: 3499, category: "paint", quantityOnHand: 3, reorderThreshold: 6 },
  { sku: "FAST-SCREW-100", name: "Wood Screws (100ct)", description: "1.5in, box of 100", priceCents: 799, category: "fasteners", quantityOnHand: 0, reorderThreshold: 10 },
];

// Inserts the seed rows in a single transaction. Idempotent on sku via
// INSERT OR IGNORE, so re-seeding a dev db neither errors nor duplicates.
export function seed(db: Db): void {
  const insertProduct = db.prepare(
    "INSERT OR IGNORE INTO products (sku, name, description, price_cents, category) VALUES (?, ?, ?, ?, ?)",
  );
  const insertInventory = db.prepare(
    "INSERT OR IGNORE INTO inventory_items (product_id, quantity_on_hand, reorder_threshold) VALUES (?, ?, ?)",
  );
  const findIdBySku = db.prepare("SELECT id FROM products WHERE sku = ?");

  const seedAll = db.transaction((items: SeedProduct[]) => {
    for (const p of items) {
      const info = insertProduct.run(p.sku, p.name, p.description, p.priceCents, p.category);
      // If the product already existed (insert ignored), look up its id so we
      // can still attach/keep its inventory row.
      const id =
        info.changes > 0
          ? Number(info.lastInsertRowid)
          : (findIdBySku.get(p.sku) as { id: number }).id;
      insertInventory.run(id, p.quantityOnHand, p.reorderThreshold);
    }
  });

  seedAll(PRODUCTS);
}

// Runnable entry: `npm run seed` opens the dev db file, migrates, and seeds.
// The guard ensures seed() can be imported without side effects.
function runSeed(): void {
  const db = openDatabase("storeflow.db");
  migrate(db);
  seed(db);
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM products").get() as { n: number };
  console.log(`Seeded storeflow.db — products table now has ${n} rows.`);
  db.close();
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runSeed();
}

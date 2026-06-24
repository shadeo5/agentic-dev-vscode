import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Db } from "./connection";

// Resolve schema.sql relative to THIS module (not the process cwd), so
// migration works the same whether run from tests, the dev server, or a
// script in any directory. import.meta.url is the ESM way to get __dirname.
const schemaPath = join(dirname(fileURLToPath(import.meta.url)), "schema.sql");

// Applies the full schema to a database. schema.sql is the source of truth;
// this just executes it. exec() runs all statements in the file. Idempotent
// because every CREATE uses IF NOT EXISTS.
export function migrate(db: Db): void {
  const schema = readFileSync(schemaPath, "utf-8");
  db.exec(schema);
}

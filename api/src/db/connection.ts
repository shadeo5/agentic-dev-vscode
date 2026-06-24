import Database from "better-sqlite3";

// A live SQLite handle. Aliasing the better-sqlite3 namespace type here keeps
// the rest of the db layer from importing the vendor type everywhere.
export type Db = Database.Database;

// Opens a better-sqlite3 connection.
//
// Defaults to an in-memory database so tests get a fresh, isolated db with
// zero setup. better-sqlite3 is synchronous by design — calls return values
// directly, no promises — which is what lets services wrap multi-step writes
// in a single atomic db.transaction() later.
//
// PRAGMA foreign_keys must be set per-connection: SQLite ships it OFF for
// backwards compatibility, and it is the switch that actually enforces our
// FOREIGN KEY constraints. Easy to forget, and silent data corruption if you
// do — so every connection goes through here.
export function openDatabase(filename = ":memory:"): Db {
  const db = new Database(filename);
  db.pragma("foreign_keys = ON");
  return db;
}

import { openDatabase } from "./db/connection";
import { migrate } from "./db/migrate";
import { createApp } from "./app";

// Entry point: the ONLY place that binds a port. The dev server uses a
// persistent SQLite file; migrate on startup (idempotent) so the schema is
// present. Seed data is loaded separately via `npm run seed`.
const db = openDatabase("storeflow.db");
migrate(db);

const app = createApp(db);
const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  console.log(`StoreFlow API listening on http://localhost:${port}`);
});

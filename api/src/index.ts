import { createApp } from "./app";

// Entry point: this is the ONLY place that binds a port. Tests import
// createApp() from app.ts instead, so they never need a running server.
const app = createApp();
const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  console.log(`StoreFlow API listening on http://localhost:${port}`);
});

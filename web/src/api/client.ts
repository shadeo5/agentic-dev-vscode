import type { Product } from "./types";

// Tiny typed wrapper over fetch. Calls go to /api/*, which the Vite dev proxy
// forwards to the API on :3000 — same-origin in the browser, so no CORS.
async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export function getProducts(): Promise<Product[]> {
  return getJson<Product[]>("/api/products");
}

export function getHealth(): Promise<{ ok: boolean }> {
  return getJson<{ ok: boolean }>("/api/health");
}

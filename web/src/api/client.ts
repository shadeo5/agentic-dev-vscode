import type { Product, Order, OrderStatus } from "./types";

// Tiny typed wrapper over fetch. Calls go to /api/*, which the Vite dev proxy
// forwards to the API on :3000 — same-origin in the browser, so no CORS.
async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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

export function getOrders(status?: OrderStatus): Promise<Order[]> {
  const query = status ? `?status=${status}` : "";
  return getJson<Order[]>(`/api/orders${query}`);
}

export function transitionOrder(id: number, to: OrderStatus): Promise<Order> {
  return postJson<Order>(`/api/orders/${id}/transition`, { to });
}

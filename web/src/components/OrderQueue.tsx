import { useEffect, useState } from "react";
import { getOrders, getProducts } from "../api/client";
import type { Order, OrderStatus } from "../api/types";
import { formatCents, formatDateTime } from "../format";

type Filter = "ALL" | OrderStatus;

const FILTERS: Filter[] = [
  "ALL",
  "PLACED",
  "PICKING",
  "PACKED",
  "FULFILLED",
  "CANCELLED",
];

const STATUS_STYLES: Record<OrderStatus, string> = {
  PLACED: "bg-gray-100 text-gray-700",
  PICKING: "bg-blue-100 text-blue-700",
  PACKED: "bg-indigo-100 text-indigo-700",
  FULFILLED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; orders: Order[]; names: Map<number, string> };

// Fetch the orders (filtered) plus the catalog (for product names) together;
// re-runs whenever the filter changes. Line items only carry productId, so we
// join names client-side from the catalog (PLAN §8 — no API change).
function useQueue(filter: Filter): State {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    const statusArg = filter === "ALL" ? undefined : filter;
    Promise.all([getOrders(statusArg), getProducts()])
      .then(([orders, products]) => {
        if (!active) return;
        const names = new Map(products.map((p) => [p.id, p.name]));
        setState({ status: "ready", orders, names });
      })
      .catch((err: unknown) => {
        if (active) {
          const message = err instanceof Error ? err.message : "unknown error";
          setState({ status: "error", message });
        }
      });
    return () => {
      active = false;
    };
  }, [filter]);

  return state;
}

export default function OrderQueue() {
  const [filter, setFilter] = useState<Filter>("ALL");
  const state = useQueue(filter);

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-gray-900">Fulfillment queue</h2>

      <div className="mt-3 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded px-3 py-1 text-xs font-medium ${
              filter === f
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {state.status === "loading" && (
        <p className="mt-3 text-sm text-gray-500">Loading…</p>
      )}

      {state.status === "error" && (
        <p className="mt-3 text-sm text-red-600">
          Couldn’t load orders: {state.message}
        </p>
      )}

      {state.status === "ready" && state.orders.length === 0 && (
        <p className="mt-3 text-sm text-gray-500">No orders.</p>
      )}

      {state.status === "ready" && state.orders.length > 0 && (
        <ul className="mt-3 space-y-3">
          {state.orders.map((o) => (
            <li
              key={o.id}
              className="rounded border border-gray-200 bg-white p-4"
            >
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <span className="font-semibold text-gray-900">#{o.id}</span>{" "}
                  <span className="text-gray-700">{o.customerName}</span>
                  <span className="ml-2 text-xs text-gray-400">
                    {formatDateTime(o.createdAt)}
                  </span>
                </div>
                <span
                  data-testid={`order-status-${o.id}`}
                  className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[o.status]}`}
                >
                  {o.status}
                </span>
              </div>

              <ul className="mt-2 space-y-0.5 text-sm text-gray-600">
                {o.lineItems.map((li) => (
                  <li key={li.productId}>
                    <span className="text-gray-800">
                      {state.names.get(li.productId) ?? `#${li.productId}`}
                    </span>{" "}
                    ×{" "}
                    <span data-testid={`qty-${o.id}-${li.productId}`}>
                      {li.quantity}
                    </span>{" "}
                    <span className="text-gray-400">
                      @ {formatCents(li.unitPriceCents)}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

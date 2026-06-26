import { useEffect, useState } from "react";
import { getOrders, getProducts, transitionOrder } from "../api/client";
import type { Order, OrderStatus } from "../api/types";
import { formatCents, formatDateTime } from "../format";
import { nextActions } from "../orderActions";

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

// Fetch orders (filtered) + the catalog (for product names) together. Re-runs on
// filter change and whenever `refreshKey` bumps (after a mutation elsewhere).
function useQueue(filter: Filter, refreshKey: number): State {
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
  }, [filter, refreshKey]);

  return state;
}

interface Props {
  // Bumped by the parent to force a refetch (kept in sync with the stock view).
  refreshKey?: number;
  // Called after a successful transition so the parent can refresh everything.
  onMutated?: () => void;
}

export default function OrderQueue({ refreshKey = 0, onMutated }: Props) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const state = useQueue(filter, refreshKey);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function act(id: number, to: OrderStatus) {
    setPendingId(id);
    setActionError(null);
    try {
      await transitionOrder(id, to);
      onMutated?.(); // parent bumps refreshKey → queue + stock view refetch
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "transition failed");
    } finally {
      setPendingId(null);
    }
  }

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

      {actionError && (
        <p className="mt-3 text-sm text-red-600">
          Couldn’t update order: {actionError}
        </p>
      )}

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

              {nextActions(o.status).length > 0 && (
                <div className="mt-3 flex gap-2">
                  {nextActions(o.status).map((a) => (
                    <button
                      key={a.to}
                      type="button"
                      disabled={pendingId === o.id}
                      onClick={() => act(o.id, a.to)}
                      className={`rounded px-3 py-1 text-xs font-medium disabled:opacity-50 ${
                        a.to === "CANCELLED"
                          ? "bg-red-50 text-red-700 hover:bg-red-100"
                          : "bg-gray-900 text-white hover:bg-gray-700"
                      }`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

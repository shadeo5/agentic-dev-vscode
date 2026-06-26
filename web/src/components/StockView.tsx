import { useEffect, useState } from "react";
import { getProducts } from "../api/client";
import type { Product } from "../api/types";
import { formatCents } from "../format";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; products: Product[] };

// Load the catalog once on mount. The discriminated union makes the three
// render states (loading / error / ready) exhaustive and type-safe.
function useProducts(): State {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let active = true;
    getProducts()
      .then((products) => {
        if (active) setState({ status: "ready", products });
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
  }, []);

  return state;
}

export default function StockView() {
  const state = useProducts();

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-gray-900">Stock</h2>

      {state.status === "loading" && (
        <p className="mt-2 text-sm text-gray-500">Loading…</p>
      )}

      {state.status === "error" && (
        <p className="mt-2 text-sm text-red-600">
          Couldn’t load products: {state.message}
        </p>
      )}

      {state.status === "ready" && state.products.length === 0 && (
        <p className="mt-2 text-sm text-gray-500">No products yet.</p>
      )}

      {state.status === "ready" && state.products.length > 0 && (
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="py-2">Product</th>
              <th className="py-2">SKU</th>
              <th className="py-2 text-right">Price</th>
              <th className="py-2 text-right">On hand</th>
              <th className="py-2 text-right">Reserved</th>
              <th className="py-2 text-right">Available</th>
            </tr>
          </thead>
          <tbody>
            {state.products.map((p) => (
              <tr key={p.id} className="border-t border-gray-100">
                <td className="py-2 font-medium text-gray-900">{p.name}</td>
                <td className="py-2 font-mono text-gray-500">{p.sku}</td>
                <td className="py-2 text-right">{formatCents(p.priceCents)}</td>
                <td className="py-2 text-right text-gray-700">
                  {p.quantityOnHand}
                </td>
                <td className="py-2 text-right text-gray-700">
                  {p.quantityReserved}
                </td>
                <td
                  data-testid={`available-${p.id}`}
                  className={`py-2 text-right font-semibold ${
                    p.available === 0 ? "text-red-600" : "text-gray-900"
                  }`}
                >
                  {p.available}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

import { useState } from "react";
import HealthBadge from "./components/HealthBadge";
import StockView from "./components/StockView";
import OrderQueue from "./components/OrderQueue";

export default function App() {
  // A shared refresh counter: when an order transition mutates state, bump it so
  // both the stock view and the queue refetch and stay consistent.
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto max-w-3xl p-8">
        <header className="flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">StoreFlow</h1>
            <p className="mt-1 text-gray-600">Associate dashboard</p>
          </div>
          <HealthBadge />
        </header>

        <StockView refreshKey={refreshKey} />
        <OrderQueue refreshKey={refreshKey} onMutated={refresh} />
      </main>
    </div>
  );
}

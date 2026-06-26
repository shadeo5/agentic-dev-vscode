import HealthBadge from "./components/HealthBadge";
import StockView from "./components/StockView";

export default function App() {
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

        <StockView />
      </main>
    </div>
  );
}

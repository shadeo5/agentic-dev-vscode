import { useEffect, useState } from "react";

type Health = "checking" | "ok" | "down";

// Proof-of-life: hits the API (through the Vite dev proxy) and reports liveness.
// Establishes the fetch pattern every later slice's data hook will reuse.
function useApiHealth(): Health {
  const [status, setStatus] = useState<Health>("checking");

  useEffect(() => {
    let active = true;
    fetch("/api/health")
      .then((res) => res.json())
      .then((body: { ok?: boolean }) => {
        if (active) setStatus(body.ok ? "ok" : "down");
      })
      .catch(() => {
        if (active) setStatus("down");
      });
    return () => {
      active = false;
    };
  }, []);

  return status;
}

export default function App() {
  const health = useApiHealth();

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold text-gray-900">StoreFlow</h1>
      <p className="mt-1 text-gray-600">Associate dashboard</p>
      <p className="mt-6 text-sm">
        API status:{" "}
        <span data-testid="api-health" className="font-mono font-semibold">
          {health}
        </span>
      </p>
    </main>
  );
}

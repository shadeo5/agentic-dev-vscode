import { useEffect, useState } from "react";
import { getHealth } from "../api/client";

type Health = "checking" | "ok" | "down";

// Small liveness indicator for the dashboard header.
export default function HealthBadge() {
  const [status, setStatus] = useState<Health>("checking");

  useEffect(() => {
    let active = true;
    getHealth()
      .then((body) => {
        if (active) setStatus(body.ok ? "ok" : "down");
      })
      .catch(() => {
        if (active) setStatus("down");
      });
    return () => {
      active = false;
    };
  }, []);

  const color =
    status === "ok"
      ? "text-green-600"
      : status === "down"
        ? "text-red-600"
        : "text-gray-400";

  return (
    <span className="text-xs text-gray-500">
      API:{" "}
      <span
        data-testid="api-health"
        className={`font-mono font-semibold ${color}`}
      >
        {status}
      </span>
    </span>
  );
}

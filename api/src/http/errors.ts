import type { Shortfall } from "../domain/inventory";

// Typed errors that carry their HTTP status. Services throw these to signal a
// precise failure; the route layer catches AppError and maps it to a response,
// keeping HTTP concerns out of the service/domain layers.
export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

// A referenced resource (e.g. a product id) does not exist → 404.
export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404);
  }
}

// The request is well-formed but conflicts with current stock → 409. Carries
// the per-product shortfalls so the client knows exactly what's short.
export class InsufficientStockError extends AppError {
  constructor(shortfalls: Shortfall[]) {
    super("Insufficient stock", 409, shortfalls);
  }
}

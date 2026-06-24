// Pure domain types — no I/O, no Express, no db. The catalog's product
// representation, including current stock. Money is integer cents.
export interface Product {
  id: number;
  sku: string;
  name: string;
  description: string;
  priceCents: number;
  category: string;
  quantityOnHand: number;
}

// The order state-machine vocabulary (see PLAN §4 / SPEC). The machine itself
// arrives in Slice 5; this union is the shared type until then.
export type OrderStatus =
  | "PLACED"
  | "PICKING"
  | "PACKED"
  | "FULFILLED"
  | "CANCELLED";

// A line on an order. unit_price_cents is a snapshot taken at placement.
export interface OrderLineItem {
  productId: number;
  quantity: number;
  unitPriceCents: number;
}

export interface Order {
  id: number;
  status: OrderStatus;
  customerName: string;
  createdAt: string; // ISO-8601
  lineItems: OrderLineItem[];
}

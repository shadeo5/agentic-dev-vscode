// Mirrors the API's product response. No shared package yet (no workspaces),
// so web/ duplicates the response shape — keep in sync with api's domain/types.
export interface Product {
  id: number;
  sku: string;
  name: string;
  description: string;
  priceCents: number;
  category: string;
  quantityOnHand: number;
  quantityReserved: number;
  available: number;
}

export type OrderStatus =
  | "PLACED"
  | "PICKING"
  | "PACKED"
  | "FULFILLED"
  | "CANCELLED";

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

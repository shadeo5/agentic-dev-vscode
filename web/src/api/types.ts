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

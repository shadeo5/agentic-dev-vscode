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

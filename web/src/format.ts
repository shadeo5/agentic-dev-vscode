// Money is integer cents everywhere; formatting to display dollars happens only
// at the view boundary. Intl.NumberFormat gives correct rounding, the currency
// symbol, and thousands separators for free (e.g. 123456 → "$1,234.56").
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatCents(cents: number): string {
  return usd.format(cents / 100);
}

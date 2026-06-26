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

const dateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

// ISO-8601 string → a short local date/time, e.g. "Jun 25, 2026, 10:00 AM".
export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

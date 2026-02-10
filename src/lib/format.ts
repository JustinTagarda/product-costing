const currencyFormatterCache = new Map<string, Intl.NumberFormat>();

function getCurrencyFormatter(currency: string): Intl.NumberFormat {
  const key = currency.toUpperCase();
  const cached = currencyFormatterCache.get(key);
  if (cached) return cached;
  const fmt = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: key,
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 2,
  });
  currencyFormatterCache.set(key, fmt);
  return fmt;
}

export function formatCents(cents: number, currency = "USD"): string {
  const safe = Number.isFinite(cents) ? cents : 0;
  return getCurrencyFormatter(currency).format(safe / 100);
}

export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
  }).format(d);
}


const currencyFormatterCache = new Map<string, Intl.NumberFormat>();

type FormatCurrencyOptions = {
  currencyDisplay?: "symbol" | "code";
  roundingIncrementCents?: number;
  roundingMode?: "nearest" | "up" | "down";
};

type DateFormatOptions = {
  dateFormat?: "MM/dd/yyyy" | "dd/MM/yyyy" | "yyyy-MM-dd";
  timezone?: string;
};

function roundByMode(value: number, mode: "nearest" | "up" | "down"): number {
  if (mode === "up") return Math.ceil(value);
  if (mode === "down") return Math.floor(value);
  return Math.round(value);
}

function applyCurrencyRounding(cents: number, options?: FormatCurrencyOptions): number {
  const increment = Math.max(1, Math.round(options?.roundingIncrementCents ?? 1));
  if (increment <= 1) return cents;
  const mode = options?.roundingMode ?? "nearest";
  return roundByMode(cents / increment, mode) * increment;
}

function getCurrencyFormatter(currency: string, display: "symbol" | "code"): Intl.NumberFormat {
  const currencyCode = currency.toUpperCase();
  const key = `${currencyCode}_${display}`;
  const cached = currencyFormatterCache.get(key);
  if (cached) return cached;
  const fmt = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currencyCode,
    currencyDisplay: display === "code" ? "code" : "narrowSymbol",
    maximumFractionDigits: 2,
  });
  currencyFormatterCache.set(key, fmt);
  return fmt;
}

export function formatCents(cents: number, currency = "USD", options?: FormatCurrencyOptions): string {
  const safe = Number.isFinite(cents) ? cents : 0;
  const rounded = applyCurrencyRounding(safe, options);
  const display = options?.currencyDisplay === "code" ? "code" : "symbol";
  return getCurrencyFormatter(currency, display).format(rounded / 100);
}

export function currencySymbol(currency: string): string {
  const parts = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).formatToParts(0);
  const symbol = parts.find((part) => part.type === "currency")?.value;
  return symbol || "$";
}

export function formatShortDate(iso: string, options?: DateFormatOptions): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const timezone = options?.timezone;
  const dateFormat = options?.dateFormat ?? "MM/dd/yyyy";
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  }).formatToParts(d);

  const mm = parts.find((part) => part.type === "month")?.value ?? "01";
  const dd = parts.find((part) => part.type === "day")?.value ?? "01";
  const yyyy = parts.find((part) => part.type === "year")?.value ?? "1970";

  if (dateFormat === "dd/MM/yyyy") return `${dd}/${mm}/${yyyy}`;
  if (dateFormat === "yyyy-MM-dd") return `${yyyy}-${mm}-${dd}`;
  return `${mm}/${dd}/${yyyy}`;
}

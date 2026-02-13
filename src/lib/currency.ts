import { currencySymbol, formatCents } from "@/lib/format";

export function currencyCodeFromSettings(baseCurrency: string | null | undefined): string {
  const normalized = typeof baseCurrency === "string" ? baseCurrency.trim().toUpperCase() : "";
  return /^[A-Z]{3}$/.test(normalized) ? normalized : "USD";
}

export function currencySymbolFromSettings(baseCurrency: string | null | undefined): string {
  return currencySymbol(currencyCodeFromSettings(baseCurrency));
}

export function formatCentsWithSettingsSymbol(
  cents: number,
  baseCurrency: string | null | undefined,
  roundingIncrementCents: number,
  roundingMode: "nearest" | "up" | "down",
): string {
  return formatCents(cents, currencyCodeFromSettings(baseCurrency), {
    currencyDisplay: "symbol",
    roundingIncrementCents,
    roundingMode,
  });
}

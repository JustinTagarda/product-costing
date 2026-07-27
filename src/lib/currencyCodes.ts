import { currencySymbol, getCurrencyDecimalDigits } from "@/lib/format";

export { getCurrencyDecimalDigits };

const FALLBACK_CURRENCY_CODES = [
  "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "CNY", "INR", "PHP",
  "SGD", "HKD", "NZD", "SEK", "NOK", "DKK", "MXN", "BRL", "ZAR", "AED",
  "SAR", "THB", "IDR", "MYR", "VND", "KRW", "TWD", "PLN", "TRY", "ILS",
];

function getAllCurrencyCodes(): string[] {
  try {
    const supportedValuesOf = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
      .supportedValuesOf;
    const values = supportedValuesOf?.("currency");
    if (values && values.length) return values;
  } catch {
    // fall through to the static fallback below
  }
  return FALLBACK_CURRENCY_CODES;
}

export function isValidCurrencyCode(code: string): boolean {
  const normalized = (code || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) return false;
  return getAllCurrencyCodes().includes(normalized);
}

export type CurrencyOption = {
  code: string;
  name: string;
  symbol: string;
};

export function listSupportedCurrencies(): CurrencyOption[] {
  const codes = getAllCurrencyCodes();
  let displayNames: Intl.DisplayNames | null = null;
  try {
    displayNames = new Intl.DisplayNames(undefined, { type: "currency" });
  } catch {
    displayNames = null;
  }

  return codes
    .map((code) => ({
      code,
      name: displayNames?.of(code) ?? code,
      symbol: currencySymbol(code),
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

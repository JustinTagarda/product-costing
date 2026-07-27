import { describe, expect, it } from "vitest";
import { getCurrencyDecimalDigits, isValidCurrencyCode, listSupportedCurrencies } from "@/lib/currencyCodes";

describe("isValidCurrencyCode", () => {
  it("accepts real ISO 4217 codes", () => {
    expect(isValidCurrencyCode("USD")).toBe(true);
    expect(isValidCurrencyCode("jpy")).toBe(true);
  });

  it("rejects made-up 3-letter codes and malformed input", () => {
    expect(isValidCurrencyCode("ZZZ")).toBe(false);
    expect(isValidCurrencyCode("US")).toBe(false);
    expect(isValidCurrencyCode("")).toBe(false);
  });
});

describe("getCurrencyDecimalDigits", () => {
  it("returns 2 for typical currencies", () => {
    expect(getCurrencyDecimalDigits("USD")).toBe(2);
    expect(getCurrencyDecimalDigits("EUR")).toBe(2);
  });

  it("returns 0 for zero-decimal currencies", () => {
    expect(getCurrencyDecimalDigits("JPY")).toBe(0);
  });

  it("caps 3-decimal currencies at 2, matching the integer-cents storage model", () => {
    expect(getCurrencyDecimalDigits("KWD")).toBe(2);
  });

  it("falls back to 2 for an invalid code", () => {
    expect(getCurrencyDecimalDigits("ZZZ")).toBe(2);
  });
});

describe("listSupportedCurrencies", () => {
  it("includes common currencies with a name and symbol, sorted by code", () => {
    const options = listSupportedCurrencies();
    const usd = options.find((o) => o.code === "USD");
    expect(usd).toBeDefined();
    expect(usd?.symbol).toBe("$");
    expect(options.length).toBeGreaterThan(20);
    const codes = options.map((o) => o.code);
    expect(codes).toEqual([...codes].sort());
  });
});

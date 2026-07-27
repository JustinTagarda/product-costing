import { describe, expect, it } from "vitest";
import { formatCentsToMoney, parseMoneyToCents } from "@/components/DeferredNumericInput";

describe("parseMoneyToCents", () => {
  it("defaults to 2 decimal digits, matching prior behavior", () => {
    expect(parseMoneyToCents("12.34")).toBe(1234);
    expect(parseMoneyToCents("1,234.56")).toBe(123456);
  });

  it("rounds to the nearest whole major unit for a 0-decimal currency", () => {
    expect(parseMoneyToCents("1234", 0)).toBe(123400);
    expect(parseMoneyToCents("1234.6", 0)).toBe(123500);
  });

  it("never returns a negative value", () => {
    expect(parseMoneyToCents("-5")).toBe(0);
  });
});

describe("formatCentsToMoney", () => {
  it("defaults to 2 decimal places", () => {
    expect(formatCentsToMoney(1234)).toBe("12.34");
  });

  it("shows 0 decimal places for a 0-decimal currency", () => {
    expect(formatCentsToMoney(123400, 0)).toBe("1234");
  });
});

export type PurchasesImportValidationResult =
  | {
      ok: true;
      message?: string;
    }
  | {
      ok: false;
      reason: string;
    };

export const REQUIRED_PURCHASE_HEADERS = [
  "Description",
  "Quantity",
  "Cost",
  "Usable Quantity",
  "Purchase Date",
] as const;

export const OPTIONAL_PURCHASE_HEADERS = [
  "Material",
  "Variation",
  "Marketplace",
  "Store",
] as const;

export const ALLOWED_PURCHASE_HEADERS = [
  ...REQUIRED_PURCHASE_HEADERS,
  ...OPTIONAL_PURCHASE_HEADERS,
] as const;

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function parseHeaderRow(tsv: string): string[] {
  const firstLine = tsv.split(/\r?\n/).find((line) => line.trim().length > 0) || "";
  return firstLine.split("\t").map((cell) => cell.trim());
}

export function validatePurchasesImportTsv(tsv: string): PurchasesImportValidationResult {
  const header = parseHeaderRow(tsv);
  if (!header.length || (header.length === 1 && header[0] === "")) {
    return { ok: false, reason: "Validation failed: header row is empty." };
  }

  const emptyHeaderIndexes = header
    .map((cell, index) => ({ cell, index }))
    .filter((item) => item.cell.length === 0)
    .map((item) => item.index + 1);
  if (emptyHeaderIndexes.length > 0) {
    return {
      ok: false,
      reason: `Validation failed: header has empty column names at position(s): ${emptyHeaderIndexes.join(", ")}.`,
    };
  }

  const duplicateHeaders = unique(
    header.filter((cell, index) => header.indexOf(cell) !== index),
  );
  if (duplicateHeaders.length > 0) {
    return {
      ok: false,
      reason: `Validation failed: duplicate header(s): ${duplicateHeaders.join(", ")}.`,
    };
  }

  const unknownHeaders = header.filter((cell) => !ALLOWED_PURCHASE_HEADERS.includes(cell as (typeof ALLOWED_PURCHASE_HEADERS)[number]));
  if (unknownHeaders.length > 0) {
    return {
      ok: false,
      reason:
        `Validation failed: unsupported header(s): ${unique(unknownHeaders).join(", ")}. ` +
        `Allowed headers: ${ALLOWED_PURCHASE_HEADERS.join(", ")}.`,
    };
  }

  const missingRequired = REQUIRED_PURCHASE_HEADERS.filter((required) => !header.includes(required));
  if (missingRequired.length > 0) {
    return {
      ok: false,
      reason: `Validation failed: missing required header(s): ${missingRequired.join(", ")}.`,
    };
  }

  return {
    ok: true,
    message: "Purchases-specific header validation passed.",
  };
}

function normalizePrefix(prefix: string): string {
  return (prefix || "").trim().toUpperCase();
}

function normalizeCode(code: string): string {
  return (code || "").trim().toUpperCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseCodeNumber(code: string, prefix: string): number | null {
  const normalizedPrefix = normalizePrefix(prefix);
  if (!normalizedPrefix) return null;
  const normalizedCode = normalizeCode(code);
  const match = normalizedCode.match(new RegExp(`^${escapeRegExp(normalizedPrefix)}(\\d+)$`));
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

export function getNextCodeNumber(codes: readonly string[], prefix: string): number {
  let max = 0;
  for (const code of codes) {
    const n = parseCodeNumber(code, prefix);
    if (n !== null && n > max) max = n;
  }
  return max + 1;
}

export function formatCode(prefix: string, number: number, minDigits = 4): string {
  const normalizedPrefix = normalizePrefix(prefix);
  const safeNumber = Number.isInteger(number) && number > 0 ? number : 1;
  return `${normalizedPrefix}${String(safeNumber).padStart(minDigits, "0")}`;
}

export function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: unknown; message?: unknown; details?: unknown };
  const code = typeof maybe.code === "string" ? maybe.code : "";
  const message = typeof maybe.message === "string" ? maybe.message : "";
  const details = typeof maybe.details === "string" ? maybe.details : "";
  if (code === "23505") return true;
  const combined = `${message} ${details}`.toLowerCase();
  return combined.includes("duplicate key") || combined.includes("unique constraint");
}


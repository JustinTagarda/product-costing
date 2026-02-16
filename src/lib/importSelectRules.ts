type ImportSelectOption<TValue extends string> = {
  value: TValue;
  aliases?: string[];
};

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

export function resolveImportedSelectValue<TValue extends string>(
  rawValue: string,
  options: Array<ImportSelectOption<TValue>>,
): TValue | null {
  const token = normalizeToken(rawValue);
  if (!token) return null;

  for (const option of options) {
    if (normalizeToken(option.value) === token) return option.value;
    if (option.aliases?.some((alias) => normalizeToken(alias) === token)) return option.value;
  }

  return null;
}

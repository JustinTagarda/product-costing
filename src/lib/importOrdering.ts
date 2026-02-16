export function appendImportedRowsAtBottom<T>(
  existingRows: readonly T[],
  importedRows: readonly T[],
): T[] {
  if (!existingRows.length) return [...importedRows];
  if (!importedRows.length) return [...existingRows];
  return [...existingRows, ...importedRows];
}


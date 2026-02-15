export type ImportValidationResult =
  | {
      ok: true;
      tsv: string;
      convertedFromCsv: boolean;
      message: string;
    }
  | {
      ok: false;
      reason: string;
    };

type DelimiterType = "csv" | "tsv";

type ParseDelimitedResult =
  | {
      ok: true;
      rows: string[][];
    }
  | {
      ok: false;
      reason: string;
    };

function normalizeInput(raw: string): string {
  return raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
}

function detectDelimiterType(text: string): DelimiterType | null {
  if (text.includes("\t")) return "tsv";
  if (text.includes(",")) return "csv";
  return null;
}

function parseDelimited(text: string, delimiter: string): ParseDelimitedResult {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      if (field.length === 0) {
        inQuotes = true;
      } else {
        field += char;
      }
      continue;
    }

    if (char === delimiter) {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (inQuotes) {
    return { ok: false, reason: "Unclosed quoted value found in the pasted data." };
  }

  row.push(field);
  rows.push(row);

  const compactRows = rows
    .map((r) => r.map((cell) => cell.trim()))
    .filter((r) => r.some((cell) => cell.length > 0));

  if (!compactRows.length) {
    return { ok: false, reason: "No rows were detected after cleaning the input." };
  }

  return { ok: true, rows: compactRows };
}

function sanitizeCell(cell: string): string {
  return cell.replace(/\r?\n/g, " ").replace(/\t/g, " ").trim();
}

function sanitizeRows(rows: string[][]): string[][] {
  return rows.map((row) => row.map(sanitizeCell));
}

function isLikelyDataToken(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  if (/^-?\d+([.,]\d+)?$/.test(normalized)) return true;
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(normalized)) return true;
  if (/^(true|false|yes|no)$/i.test(normalized)) return true;
  if (/^[\p{Sc}]?\d+/u.test(normalized)) return true;
  return false;
}

function hasHeaderRow(firstRow: string[]): boolean {
  const cells = firstRow.map((cell) => cell.trim());
  const nonEmptyCells = cells.filter((cell) => cell.length > 0);
  if (nonEmptyCells.length < 2) return false;

  const alphaCellCount = nonEmptyCells.filter((cell) => /[A-Za-z]/.test(cell)).length;
  const likelyDataCellCount = nonEmptyCells.filter(isLikelyDataToken).length;

  if (alphaCellCount === 0) return false;
  if (likelyDataCellCount === nonEmptyCells.length && alphaCellCount < nonEmptyCells.length) return false;
  return alphaCellCount >= Math.ceil(nonEmptyCells.length / 2);
}

function validateUniformRows(rows: string[][]): { ok: true } | { ok: false; reason: string } {
  if (!rows.length) return { ok: false, reason: "No rows found after parsing." };

  const expectedColumns = rows[0].length;
  if (expectedColumns < 2) {
    return { ok: false, reason: "At least 2 columns are required in the header row." };
  }
  if (rows.length < 2) {
    return {
      ok: false,
      reason: "Validation failed: only header row found. Add at least one data row.",
    };
  }

  const headerArrangement = rows[0].map((cell) => cell.length > 0);

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const displayRowNumber = rowIndex + 1;

    if (row.length !== expectedColumns) {
      return {
        ok: false,
        reason: `Validation failed: not all rows have the same number of columns (row ${displayRowNumber}).`,
      };
    }

    const hasEmptyCell = row.some((cell) => cell.length === 0);
    if (hasEmptyCell) {
      return {
        ok: false,
        reason: `Validation failed: some rows are not complete (row ${displayRowNumber}).`,
      };
    }

    const arrangement = row.map((cell) => cell.length > 0);
    const hasDifferentArrangement = arrangement.some((isFilled, i) => isFilled !== headerArrangement[i]);
    if (hasDifferentArrangement) {
      return {
        ok: false,
        reason: `Validation failed: rows do not have the same cell arrangement (row ${displayRowNumber}).`,
      };
    }
  }

  return { ok: true };
}

function isValidTsv(tsv: string): boolean {
  const lines = tsv.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) return false;

  const expectedColumns = lines[0].split("\t").length;
  if (expectedColumns < 2) return false;

  return lines.every((line) => line.split("\t").length === expectedColumns);
}

export function validateAndNormalizeImportText(rawInput: string): ImportValidationResult {
  const normalizedInput = normalizeInput(rawInput);
  if (!normalizedInput) {
    return { ok: false, reason: "Textarea is empty. Paste CSV or TSV content first." };
  }

  const delimiterType = detectDelimiterType(normalizedInput);
  if (!delimiterType) {
    return {
      ok: false,
      reason: "Could not detect CSV or TSV delimiters. Use comma-separated or tab-separated values.",
    };
  }

  const parseResult = parseDelimited(normalizedInput, delimiterType === "csv" ? "," : "\t");
  if (!parseResult.ok) {
    return { ok: false, reason: parseResult.reason };
  }

  const sanitizedRows = sanitizeRows(parseResult.rows);
  if (sanitizedRows.length === 0) {
    return { ok: false, reason: "No valid rows remained after formatting cleanup." };
  }

  if (!hasHeaderRow(sanitizedRows[0])) {
    return {
      ok: false,
      reason: "Header row is missing or invalid. Include a descriptive header row as the first line.",
    };
  }

  const rowValidationResult = validateUniformRows(sanitizedRows);
  if (!rowValidationResult.ok) {
    return { ok: false, reason: rowValidationResult.reason };
  }

  const tsv = sanitizedRows.map((row) => row.join("\t")).join("\n");
  if (!isValidTsv(tsv)) {
    return {
      ok: false,
      reason: "Could not repair the pasted data into a valid TSV layout. Check row delimiters and quotes.",
    };
  }

  return {
    ok: true,
    tsv,
    convertedFromCsv: delimiterType === "csv",
    message:
      delimiterType === "csv"
        ? "Validation passed. CSV input was converted to TSV."
        : "Validation passed. TSV format looks valid.",
  };
}

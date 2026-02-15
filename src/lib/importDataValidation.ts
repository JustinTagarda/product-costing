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

function trimTrailingEmptyColumns(rows: string[][]): string[][] {
  let lastNonEmptyColumn = -1;
  for (const row of rows) {
    for (let i = row.length - 1; i >= 0; i -= 1) {
      if (row[i].trim().length > 0) {
        lastNonEmptyColumn = Math.max(lastNonEmptyColumn, i);
        break;
      }
    }
  }

  const width = Math.max(lastNonEmptyColumn + 1, 1);
  return rows.map((row) => row.slice(0, width));
}

function sanitizeCell(cell: string): string {
  return cell.replace(/\r?\n/g, " ").replace(/\t/g, " ").trim();
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

function createRectifiedRows(rows: string[][]): string[][] {
  const width = Math.max(...rows.map((row) => row.length));
  return rows.map((row) => {
    const padded = [...row];
    while (padded.length < width) padded.push("");
    return padded.map(sanitizeCell);
  });
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

  const trimmedRows = trimTrailingEmptyColumns(parseResult.rows);
  if (trimmedRows.length === 0) {
    return { ok: false, reason: "No valid rows remained after formatting cleanup." };
  }

  const fixedRows = createRectifiedRows(trimmedRows);
  if (!hasHeaderRow(fixedRows[0])) {
    return {
      ok: false,
      reason: "Header row is missing or invalid. Include a descriptive header row as the first line.",
    };
  }

  const tsv = fixedRows.map((row) => row.join("\t")).join("\n");
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

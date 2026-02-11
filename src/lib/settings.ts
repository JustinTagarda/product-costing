export type DateFormatOption = "MM/dd/yyyy" | "dd/MM/yyyy" | "yyyy-MM-dd";
export type CurrencyDisplayOption = "symbol" | "code";
export type RoundingMode = "nearest" | "up" | "down";
export type UnitSystem = "metric" | "imperial";
export type CostingMethod = "standard" | "average" | "fifo";

export type UomConversion = {
  id: string;
  fromUnit: string;
  toUnit: string;
  factor: number;
};

export type AppSettings = {
  countryCode: string;
  timezone: string;
  dateFormat: DateFormatOption;

  baseCurrency: string;
  currencyDisplay: CurrencyDisplayOption;
  currencyRoundingIncrement: number;
  currencyRoundingMode: RoundingMode;

  unitSystem: UnitSystem;
  defaultMaterialUnit: string;
  uomConversions: UomConversion[];

  costingMethod: CostingMethod;
  defaultWastePct: number;
  defaultMarkupPct: number;
  defaultTaxPct: number;
  priceIncludesTax: boolean;

  quantityPrecision: number;
  pricePrecision: number;

  createdAt: string;
  updatedAt: string;
};

export const LOCAL_SETTINGS_KEY = "product-costing:settings:local:v1";

export function defaultUomConversions(): UomConversion[] {
  return [
    { id: "conv_kg_lb", fromUnit: "kg", toUnit: "lb", factor: 2.20462 },
    { id: "conv_lb_kg", fromUnit: "lb", toUnit: "kg", factor: 0.453592 },
    { id: "conv_l_gal", fromUnit: "l", toUnit: "gal", factor: 0.264172 },
    { id: "conv_gal_l", fromUnit: "gal", toUnit: "l", factor: 3.78541 },
    { id: "conv_m_ft", fromUnit: "m", toUnit: "ft", factor: 3.28084 },
    { id: "conv_ft_m", fromUnit: "ft", toUnit: "m", factor: 0.3048 },
  ];
}

export function makeDefaultSettings(nowIso = new Date().toISOString()): AppSettings {
  return {
    countryCode: "US",
    timezone: "America/New_York",
    dateFormat: "MM/dd/yyyy",

    baseCurrency: "USD",
    currencyDisplay: "symbol",
    currencyRoundingIncrement: 1,
    currencyRoundingMode: "nearest",

    unitSystem: "metric",
    defaultMaterialUnit: "ea",
    uomConversions: defaultUomConversions(),

    costingMethod: "standard",
    defaultWastePct: 0,
    defaultMarkupPct: 40,
    defaultTaxPct: 0,
    priceIncludesTax: false,

    quantityPrecision: 3,
    pricePrecision: 2,

    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

function normalizeConversion(raw: unknown): UomConversion | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : "";
  const fromUnit = typeof row.fromUnit === "string" ? row.fromUnit : "";
  const toUnit = typeof row.toUnit === "string" ? row.toUnit : "";
  const factor = Number(row.factor);
  if (!fromUnit || !toUnit || !Number.isFinite(factor) || factor <= 0) return null;
  return { id: id || `${fromUnit}_${toUnit}`, fromUnit, toUnit, factor };
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function clampFloat(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizeSettings(raw: unknown): AppSettings {
  const base = makeDefaultSettings();
  if (!raw || typeof raw !== "object") return base;
  const row = raw as Partial<AppSettings>;
  const createdAt = typeof row.createdAt === "string" ? row.createdAt : base.createdAt;
  const updatedAt = typeof row.updatedAt === "string" ? row.updatedAt : base.updatedAt;
  const conversionsRaw = Array.isArray(row.uomConversions) ? row.uomConversions : [];
  const conversions = conversionsRaw
    .map((item) => normalizeConversion(item))
    .filter(Boolean) as UomConversion[];

  return {
    countryCode: typeof row.countryCode === "string" ? row.countryCode.toUpperCase() : base.countryCode,
    timezone: typeof row.timezone === "string" ? row.timezone : base.timezone,
    dateFormat:
      row.dateFormat === "MM/dd/yyyy" || row.dateFormat === "dd/MM/yyyy" || row.dateFormat === "yyyy-MM-dd"
        ? row.dateFormat
        : base.dateFormat,

    baseCurrency: typeof row.baseCurrency === "string" ? row.baseCurrency.toUpperCase() : base.baseCurrency,
    currencyDisplay: row.currencyDisplay === "code" ? "code" : "symbol",
    currencyRoundingIncrement: clampInt(row.currencyRoundingIncrement, 1, 100, base.currencyRoundingIncrement),
    currencyRoundingMode:
      row.currencyRoundingMode === "up" || row.currencyRoundingMode === "down"
        ? row.currencyRoundingMode
        : "nearest",

    unitSystem: row.unitSystem === "imperial" ? "imperial" : "metric",
    defaultMaterialUnit: typeof row.defaultMaterialUnit === "string" ? row.defaultMaterialUnit : base.defaultMaterialUnit,
    uomConversions: conversions.length ? conversions : base.uomConversions,

    costingMethod:
      row.costingMethod === "average" || row.costingMethod === "fifo" ? row.costingMethod : "standard",
    defaultWastePct: clampFloat(row.defaultWastePct, 0, 1000, base.defaultWastePct),
    defaultMarkupPct: clampFloat(row.defaultMarkupPct, 0, 10000, base.defaultMarkupPct),
    defaultTaxPct: clampFloat(row.defaultTaxPct, 0, 1000, base.defaultTaxPct),
    priceIncludesTax: Boolean(row.priceIncludesTax),

    quantityPrecision: clampInt(row.quantityPrecision, 0, 6, base.quantityPrecision),
    pricePrecision: clampInt(row.pricePrecision, 0, 6, base.pricePrecision),

    createdAt,
    updatedAt,
  };
}

export function readLocalSettings(): AppSettings {
  try {
    const raw = window.localStorage.getItem(LOCAL_SETTINGS_KEY);
    if (!raw) return makeDefaultSettings();
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return makeDefaultSettings();
  }
}

export function writeLocalSettings(settings: AppSettings): void {
  try {
    window.localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore localStorage failures.
  }
}

export function updateSettingsTimestamp(settings: AppSettings): AppSettings {
  return { ...settings, updatedAt: new Date().toISOString() };
}

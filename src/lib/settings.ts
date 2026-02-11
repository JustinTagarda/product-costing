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

const COUNTRY_TO_CURRENCY: Record<string, string> = {
  US: "USD",
  CA: "CAD",
  MX: "MXN",
  BR: "BRL",
  AR: "ARS",
  CL: "CLP",
  CO: "COP",
  PE: "PEN",
  GB: "GBP",
  IE: "EUR",
  DE: "EUR",
  FR: "EUR",
  ES: "EUR",
  IT: "EUR",
  PT: "EUR",
  NL: "EUR",
  BE: "EUR",
  AT: "EUR",
  FI: "EUR",
  SE: "SEK",
  NO: "NOK",
  DK: "DKK",
  CH: "CHF",
  PL: "PLN",
  CZ: "CZK",
  HU: "HUF",
  RO: "RON",
  TR: "TRY",
  RU: "RUB",
  UA: "UAH",
  AU: "AUD",
  NZ: "NZD",
  JP: "JPY",
  KR: "KRW",
  CN: "CNY",
  HK: "HKD",
  TW: "TWD",
  SG: "SGD",
  MY: "MYR",
  TH: "THB",
  VN: "VND",
  ID: "IDR",
  PH: "PHP",
  IN: "INR",
  PK: "PKR",
  BD: "BDT",
  AE: "AED",
  SA: "SAR",
  ZA: "ZAR",
  NG: "NGN",
  EG: "EGP",
};

const TIMEZONE_TO_COUNTRY: Record<string, string> = {
  "Asia/Manila": "PH",
  "Asia/Singapore": "SG",
  "Asia/Tokyo": "JP",
  "Asia/Seoul": "KR",
  "Asia/Shanghai": "CN",
  "Asia/Hong_Kong": "HK",
  "Asia/Taipei": "TW",
  "Asia/Bangkok": "TH",
  "Asia/Kuala_Lumpur": "MY",
  "Asia/Jakarta": "ID",
  "Asia/Kolkata": "IN",
  "Asia/Dubai": "AE",
  "Asia/Riyadh": "SA",
  "Europe/London": "GB",
  "Europe/Berlin": "DE",
  "Europe/Paris": "FR",
  "Europe/Madrid": "ES",
  "Europe/Rome": "IT",
  "Europe/Amsterdam": "NL",
  "Europe/Zurich": "CH",
  "Europe/Stockholm": "SE",
  "Europe/Copenhagen": "DK",
  "Europe/Oslo": "NO",
  "Europe/Warsaw": "PL",
  "Europe/Prague": "CZ",
  "Europe/Budapest": "HU",
  "Europe/Bucharest": "RO",
  "Europe/Istanbul": "TR",
  "Europe/Kyiv": "UA",
  "Europe/Moscow": "RU",
  "Australia/Sydney": "AU",
  "Australia/Melbourne": "AU",
  "Australia/Brisbane": "AU",
  "Australia/Perth": "AU",
  "Pacific/Auckland": "NZ",
  "America/New_York": "US",
  "America/Chicago": "US",
  "America/Denver": "US",
  "America/Los_Angeles": "US",
  "America/Toronto": "CA",
  "America/Vancouver": "CA",
  "America/Montreal": "CA",
  "America/Mexico_City": "MX",
  "America/Sao_Paulo": "BR",
  "America/Argentina/Buenos_Aires": "AR",
  "America/Santiago": "CL",
  "America/Bogota": "CO",
  "America/Lima": "PE",
  "Africa/Johannesburg": "ZA",
  "Africa/Lagos": "NG",
  "Africa/Cairo": "EG",
};

const COUNTRY_TO_DATE_FORMAT: Partial<Record<string, DateFormatOption>> = {
  US: "MM/dd/yyyy",
  PH: "MM/dd/yyyy",
  CA: "yyyy-MM-dd",
  CN: "yyyy-MM-dd",
  JP: "yyyy-MM-dd",
  KR: "yyyy-MM-dd",
  TW: "yyyy-MM-dd",
};

function parseCountryFromLocale(locale: string): string | null {
  try {
    const lang = Intl.Locale ? new Intl.Locale(locale).maximize() : null;
    const region = lang?.region;
    if (region && /^[A-Z]{2}$/.test(region)) return region;
  } catch {
    // Ignore locale parse failures.
  }
  const match = locale.toUpperCase().match(/-([A-Z]{2})(?:-|$)/);
  return match?.[1] ?? null;
}

function inferCountryFromTimezone(timezone: string): string | null {
  if (!timezone) return null;
  const exact = TIMEZONE_TO_COUNTRY[timezone];
  if (exact) return exact;
  const normalized = timezone.trim();
  if (!normalized.includes("/")) return null;
  const [region] = normalized.split("/");
  if (region === "America") return "US";
  if (region === "Europe") return null;
  if (region === "Asia") return null;
  if (region === "Australia") return "AU";
  return null;
}

function inferDateFormatFromLocale(locale: string): DateFormatOption {
  const upper = locale.toUpperCase();
  if (upper.includes("-US")) return "MM/dd/yyyy";
  if (upper.includes("-CA")) return "yyyy-MM-dd";
  return "dd/MM/yyyy";
}

function inferDateFormat(locale: string, countryCode: string): DateFormatOption {
  const byCountry = COUNTRY_TO_DATE_FORMAT[countryCode];
  if (byCountry) return byCountry;
  return inferDateFormatFromLocale(locale);
}

export function detectRuntimeSettingsDefaults(): Partial<AppSettings> {
  if (typeof window === "undefined") return {};
  const nav = window.navigator;
  const primaryLocale = nav.languages?.[0] || nav.language || "en-US";
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const timezoneCountry = inferCountryFromTimezone(timezone);
  const localeCountry = parseCountryFromLocale(primaryLocale);
  const countryCode = timezoneCountry || localeCountry || "US";
  const baseCurrency = COUNTRY_TO_CURRENCY[countryCode] || "USD";
  const dateFormat = inferDateFormat(primaryLocale, countryCode);

  return {
    countryCode,
    timezone,
    baseCurrency,
    dateFormat,
  };
}

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
  const runtime = detectRuntimeSettingsDefaults();
  return {
    countryCode: runtime.countryCode || "US",
    timezone: runtime.timezone || "America/New_York",
    dateFormat: runtime.dateFormat || "MM/dd/yyyy",

    baseCurrency: runtime.baseCurrency || "USD",
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

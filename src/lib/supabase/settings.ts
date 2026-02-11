import type { AppSettings, UomConversion } from "@/lib/settings";
import { makeDefaultSettings, normalizeSettings } from "@/lib/settings";

export type DbAppSettingsRow = {
  user_id: string;
  country_code: string;
  timezone: string;
  date_format: string;
  base_currency: string;
  currency_display: string;
  currency_rounding_increment: number | string;
  currency_rounding_mode: string;
  unit_system: string;
  default_material_unit: string;
  uom_conversions: unknown;
  costing_method: string;
  default_waste_pct: number | string;
  default_markup_pct: number | string;
  default_tax_pct: number | string;
  price_includes_tax: boolean;
  quantity_precision: number | string;
  price_precision: number | string;
  created_at: string;
  updated_at: string;
};

export type DbAppSettingsInsert = Omit<DbAppSettingsRow, "created_at" | "updated_at"> & {
  created_at?: string;
  updated_at?: string;
};

export type DbAppSettingsUpdate = Partial<Omit<DbAppSettingsRow, "user_id" | "created_at">> & {
  updated_at?: string;
};

function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeConversions(value: unknown): UomConversion[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const row = item as Partial<UomConversion>;
      const factor = asNumber(row.factor, 0);
      if (!row.fromUnit || !row.toUnit || factor <= 0) return null;
      return {
        id: typeof row.id === "string" ? row.id : `${row.fromUnit}_${row.toUnit}`,
        fromUnit: String(row.fromUnit),
        toUnit: String(row.toUnit),
        factor,
      };
    })
    .filter(Boolean) as UomConversion[];
}

export function rowToSettings(row: DbAppSettingsRow): AppSettings {
  const defaults = makeDefaultSettings();
  return normalizeSettings({
    countryCode: row.country_code ?? defaults.countryCode,
    timezone: row.timezone ?? defaults.timezone,
    dateFormat: row.date_format ?? defaults.dateFormat,
    baseCurrency: row.base_currency ?? defaults.baseCurrency,
    currencyDisplay: row.currency_display ?? defaults.currencyDisplay,
    currencyRoundingIncrement: asNumber(
      row.currency_rounding_increment,
      defaults.currencyRoundingIncrement,
    ),
    currencyRoundingMode: row.currency_rounding_mode ?? defaults.currencyRoundingMode,
    unitSystem: row.unit_system ?? defaults.unitSystem,
    defaultMaterialUnit: row.default_material_unit ?? defaults.defaultMaterialUnit,
    uomConversions: normalizeConversions(row.uom_conversions),
    costingMethod: row.costing_method ?? defaults.costingMethod,
    defaultWastePct: asNumber(row.default_waste_pct, defaults.defaultWastePct),
    defaultMarkupPct: asNumber(row.default_markup_pct, defaults.defaultMarkupPct),
    defaultTaxPct: asNumber(row.default_tax_pct, defaults.defaultTaxPct),
    priceIncludesTax: row.price_includes_tax ?? defaults.priceIncludesTax,
    quantityPrecision: asNumber(row.quantity_precision, defaults.quantityPrecision),
    pricePrecision: asNumber(row.price_precision, defaults.pricePrecision),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function settingsToInsert(userId: string, settings: AppSettings): DbAppSettingsInsert {
  return {
    user_id: userId,
    country_code: settings.countryCode,
    timezone: settings.timezone,
    date_format: settings.dateFormat,
    base_currency: settings.baseCurrency,
    currency_display: settings.currencyDisplay,
    currency_rounding_increment: settings.currencyRoundingIncrement,
    currency_rounding_mode: settings.currencyRoundingMode,
    unit_system: settings.unitSystem,
    default_material_unit: settings.defaultMaterialUnit,
    uom_conversions: settings.uomConversions,
    costing_method: settings.costingMethod,
    default_waste_pct: settings.defaultWastePct,
    default_markup_pct: settings.defaultMarkupPct,
    default_tax_pct: settings.defaultTaxPct,
    price_includes_tax: settings.priceIncludesTax,
    quantity_precision: settings.quantityPrecision,
    price_precision: settings.pricePrecision,
  };
}

export function settingsToUpdate(settings: AppSettings): DbAppSettingsUpdate {
  return {
    country_code: settings.countryCode,
    timezone: settings.timezone,
    date_format: settings.dateFormat,
    base_currency: settings.baseCurrency,
    currency_display: settings.currencyDisplay,
    currency_rounding_increment: settings.currencyRoundingIncrement,
    currency_rounding_mode: settings.currencyRoundingMode,
    unit_system: settings.unitSystem,
    default_material_unit: settings.defaultMaterialUnit,
    uom_conversions: settings.uomConversions,
    costing_method: settings.costingMethod,
    default_waste_pct: settings.defaultWastePct,
    default_markup_pct: settings.defaultMarkupPct,
    default_tax_pct: settings.defaultTaxPct,
    price_includes_tax: settings.priceIncludesTax,
    quantity_precision: settings.quantityPrecision,
    price_precision: settings.pricePrecision,
    updated_at: new Date().toISOString(),
  };
}

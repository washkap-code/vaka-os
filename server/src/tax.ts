import { badRequest } from "./lib.js";
import { LOCALISATION_SERVICE, platformKernel } from "./platform-runtime.js";
import type {
  DocumentTaxTreatment, TaxResolution, TaxTreatment,
} from "./platform/localisation/types.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isIsoCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function todayIsoDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function resolveTax(
  countryCode: string,
  treatment: TaxTreatment,
  taxDate: string,
): TaxResolution {
  if (!isIsoCalendarDate(taxDate)) throw badRequest("Tax date must be a valid YYYY-MM-DD calendar date");
  try {
    return platformKernel().container.get(LOCALISATION_SERVICE)
      .resolveTax(countryCode, treatment, taxDate);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tax configuration is unavailable";
    throw badRequest(message);
  }
}

export function taxRateString(resolution: TaxResolution): string {
  return resolution.percent.toFixed(2);
}

export function assertCompatibleTaxRate(rate: string | undefined, resolution: TaxResolution): void {
  if (rate === undefined) return;
  const normalized = rate.trim();
  if (!/^\d+(?:\.\d{1,6})?$/.test(normalized) || Number(normalized) !== resolution.percent) {
    throw badRequest("Supplied VAT rate does not match the effective country-pack treatment");
  }
}

export function documentTaxTreatment(treatments: readonly TaxTreatment[]): DocumentTaxTreatment {
  const unique = new Set(treatments);
  if (unique.size !== 1) return "mixed";
  return treatments[0];
}

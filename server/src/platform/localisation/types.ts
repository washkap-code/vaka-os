// ============================================================================
// COUNTRY PACK CONTRACT (Mission P2-001)
//
// A CountryPack is declarative configuration that localises VAKA for one
// jurisdiction: currencies, effective-dated tax rates and treatments,
// statutory identifier fields, and a compliance calendar. Core modules read
// localisation from the pack rather than hard-coding country rules, so adding
// a new country is configuration — never a rewrite.
// ============================================================================

export type CountryCode = string; // ISO 3166-1 alpha-2, e.g. "ZW"
export type CurrencyCode = string; // ISO 4217 technical code, e.g. "USD", "ZWG"

export interface CurrencyDefinition {
  /** Technical/storage code (ISO 4217). */
  code: CurrencyCode;
  /** Customer-facing label (e.g. "ZiG" for ZWG). Never expose the technical code to customers when a label exists. */
  label: string;
  /** Minor-unit exponent (2 for cents). */
  decimals: number;
}

export type TaxTreatment = "standard" | "zero-rated" | "exempt";

export interface TaxRate {
  /** Rate as a percentage, e.g. 15 for 15%. */
  percent: number;
  /** Inclusive-from date (ISO yyyy-mm-dd). */
  effectiveFrom: string;
  /** Exclusive-to date (ISO yyyy-mm-dd) or null for the currently-effective rate. */
  effectiveTo: string | null;
}

export interface StatutoryIdentifier {
  /** Field key, e.g. "vatNumber", "bpNumber". */
  key: string;
  /** Human label, e.g. "VAT Number". */
  label: string;
  /** Optional validation regex (string form) for the identifier. */
  pattern?: string;
  /** Whether the identifier is required for a registered business. */
  required: boolean;
}

export type ComplianceCadence = "monthly" | "quarterly" | "annual" | "once";

export interface ComplianceObligation {
  /** Stable key, e.g. "vat-return". */
  key: string;
  /** Human label, e.g. "VAT Return". */
  label: string;
  /** Filing cadence. */
  cadence: ComplianceCadence;
  /** Authority, e.g. "ZIMRA". */
  authority: string;
}

export interface CountryPack {
  code: CountryCode;
  name: string;
  /** Currencies supported in this market; first is the conventional default. */
  currencies: CurrencyDefinition[];
  /** Effective-dated standard VAT/GST rates, ordered oldest-first. */
  vatRates: TaxRate[];
  /** Tax treatments recognised in this market. */
  taxTreatments: TaxTreatment[];
  /** Statutory identifier fields captured for businesses/customers. */
  statutoryIdentifiers: StatutoryIdentifier[];
  /** Recurring compliance obligations for the compliance calendar. */
  compliance: ComplianceObligation[];
}

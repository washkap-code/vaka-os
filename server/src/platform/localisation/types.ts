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

export type DocumentTaxTreatment = TaxTreatment | "mixed";

export interface TaxRate {
  /** Rate as a percentage, e.g. 15 for 15%. */
  percent: number;
  /** Inclusive-from date (ISO yyyy-mm-dd). */
  effectiveFrom: string;
  /** Exclusive-to date (ISO yyyy-mm-dd) or null for the currently-effective rate. */
  effectiveTo: string | null;
}

export interface TaxResolution {
  treatment: TaxTreatment;
  /** Percentage snapshotted on the transaction. Zero-rated and exempt both resolve to 0. */
  percent: number;
  /** Effective standard-rate window; null for non-standard treatments. */
  effectiveFrom: string | null;
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
  /** Payroll statutory configuration (P2-009). Absent = payroll unavailable for this market. */
  payroll?: PayrollConfig;
}

// ---------------------------------------------------------------------------
// Payroll configuration (Mission P2-009). Declarative, effective-dated data —
// the payroll engine contains no country-specific rates. Everything here is a
// technical preview until `verification.status` is APPROVED by a qualified
// local practitioner.
// ---------------------------------------------------------------------------

/**
 * One progressive PAYE band. `upToMonthly` is the inclusive upper bound of
 * cumulative monthly earnings the band covers (null = unbounded top band).
 * Bands are ordered ascending and tax the excess over the previous bound.
 */
export interface PayeBand {
  upToMonthly: number | null;
  percent: number;
}

/** An effective-dated monthly PAYE table for one payment currency. */
export interface PayeTable {
  currency: CurrencyCode;
  effectiveFrom: string;
  effectiveTo: string | null;
  bands: PayeBand[];
  /** Levy charged as a percentage of the PAYE amount (Zimbabwe AIDS levy: 3). */
  taxLevyPercent: number;
}

/** Effective-dated social-security rule (Zimbabwe NSSA POBS). */
export interface SocialSecurityRule {
  effectiveFrom: string;
  effectiveTo: string | null;
  employeePercent: number;
  employerPercent: number;
  /**
   * Monthly insurable-earnings ceiling per currency. A currency with no entry
   * is NOT payroll-capable under this rule (fail closed) — e.g. the ZWG
   * ceiling is gazetted quarterly and stays unconfigured until verified.
   */
  monthlyCeilings: { currency: CurrencyCode; amount: number }[];
  /** Whether the employee contribution is deducted before PAYE. */
  employeeContributionTaxDeductible: boolean;
}

export type PayrollVerificationStatus = "TECHNICAL_PREVIEW" | "APPROVED";

export interface PayrollConfig {
  payeTables: PayeTable[];
  socialSecurity: SocialSecurityRule[];
  verification: {
    status: PayrollVerificationStatus;
    /** Shown verbatim on every payroll API response and screen. */
    note: string;
  };
}

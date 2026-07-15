// ============================================================================
// ZIMBABWE COUNTRY PACK (ZW) — reference implementation for Mission P2-001.
//
// Values mirror the current live product (USD/ZWG, 15% VAT). Every tax rate is
// effective-dated and configurable here; nothing is hard-coded in core modules.
// Knowledge-system reference: knowledge-system/10-country-packs/Zimbabwe/README.md
// ============================================================================
import type { CountryPack } from "../platform/localisation/types.js";

export const ZIMBABWE: CountryPack = {
  code: "ZW",
  name: "Zimbabwe",
  currencies: [
    { code: "USD", label: "US$", decimals: 2 },
    // Technical code ZWG; customers only ever see "ZiG".
    { code: "ZWG", label: "ZiG", decimals: 2 },
  ],
  vatRates: [
    // Current standard rate. Effective-dated so a future change is additive.
    { percent: 15, effectiveFrom: "2020-01-01", effectiveTo: null },
  ],
  taxTreatments: ["standard", "zero-rated", "exempt"],
  statutoryIdentifiers: [
    { key: "vatNumber", label: "VAT Number", required: false },
    { key: "bpNumber", label: "Business Partner (BP) Number", required: false },
  ],
  compliance: [
    { key: "vat-return", label: "VAT Return", cadence: "monthly", authority: "ZIMRA" },
    { key: "paye", label: "PAYE Remittance", cadence: "monthly", authority: "ZIMRA" },
    { key: "nssa", label: "NSSA Contributions", cadence: "monthly", authority: "NSSA" },
    { key: "qpd", label: "Quarterly Payment Dates (Income Tax)", cadence: "quarterly", authority: "ZIMRA" },
    { key: "annual-return", label: "Company Annual Return", cadence: "annual", authority: "Registrar of Companies" },
  ],
  // -------------------------------------------------------------------------
  // P2-009 payroll — TECHNICAL PREVIEW. Figures transcribed 2026-07-15 from
  // public summaries of the 2026 ZIMRA PAYE tables and NSSA POBS notices.
  // A qualified Zimbabwean accountant must verify every value (and the
  // NSSA-deductible-before-PAYE assumption) before this status is flipped to
  // APPROVED. The ZWG NSSA ceiling is gazetted quarterly and is intentionally
  // NOT configured: ZWG payroll fails closed until a verified value is added.
  // -------------------------------------------------------------------------
  payroll: {
    payeTables: [
      {
        currency: "USD",
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
        bands: [
          { upToMonthly: 100, percent: 0 },
          { upToMonthly: 300, percent: 20 },
          { upToMonthly: 3000, percent: 25 },
          { upToMonthly: null, percent: 40 },
        ],
        taxLevyPercent: 3, // AIDS levy on the PAYE amount
      },
      {
        currency: "ZWG",
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
        bands: [
          { upToMonthly: 2800, percent: 0 },
          { upToMonthly: 8400, percent: 20 },
          { upToMonthly: 84000, percent: 25 },
          { upToMonthly: null, percent: 40 },
        ],
        taxLevyPercent: 3,
      },
    ],
    socialSecurity: [
      {
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
        employeePercent: 4.5,
        employerPercent: 4.5,
        // USD ceiling only; ZWG payroll is refused until its gazetted ceiling
        // is verified and added here.
        monthlyCeilings: [{ currency: "USD", amount: 700 }],
        employeeContributionTaxDeductible: true,
      },
    ],
    verification: {
      status: "TECHNICAL_PREVIEW",
      note: "Technical preview — PAYE bands, AIDS levy, NSSA rates/ceilings and the NSSA tax-deductibility treatment require verification by a qualified Zimbabwean accountant before statutory use.",
    },
  },
};

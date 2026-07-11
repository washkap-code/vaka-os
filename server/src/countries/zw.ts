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
};

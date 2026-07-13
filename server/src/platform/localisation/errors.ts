export class UnknownCountryError extends Error {
  constructor(code: string) {
    super(`No country pack registered for "${code}"`);
    this.name = "UnknownCountryError";
  }
}

export class NoEffectiveTaxRateError extends Error {
  constructor(code: string, onDate: string) {
    super(`No effective VAT rate for "${code}" on ${onDate}`);
    this.name = "NoEffectiveTaxRateError";
  }
}

export class UnsupportedTaxTreatmentError extends Error {
  constructor(code: string, treatment: string) {
    super(`Tax treatment "${treatment}" is not supported for "${code}"`);
    this.name = "UnsupportedTaxTreatmentError";
  }
}

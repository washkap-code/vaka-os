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

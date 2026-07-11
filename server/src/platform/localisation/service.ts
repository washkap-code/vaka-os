import { NoEffectiveTaxRateError, UnknownCountryError } from "./errors.js";
import type { CountryCode, CountryPack, CurrencyDefinition, TaxRate } from "./types.js";

/** Immutable registry + accessor for country packs. Resolved from the kernel. */
export class LocalisationService {
  private readonly packs = new Map<CountryCode, CountryPack>();

  constructor(packs: readonly CountryPack[] = []) {
    for (const pack of packs) this.register(pack);
  }

  register(pack: CountryPack): void {
    this.packs.set(pack.code.toUpperCase(), pack);
  }

  has(code: CountryCode): boolean {
    return this.packs.has(code.toUpperCase());
  }

  /** Fail closed: unknown countries throw rather than silently defaulting. */
  pack(code: CountryCode): CountryPack {
    const pack = this.packs.get(code.toUpperCase());
    if (!pack) throw new UnknownCountryError(code);
    return pack;
  }

  currencies(code: CountryCode): CurrencyDefinition[] {
    return this.pack(code).currencies;
  }

  /**
   * The VAT rate effective on a given date (default: today), selected from the
   * effective-dated schedule. Throws if no rate covers the date.
   */
  vatRateOn(code: CountryCode, onDate: string = new Date().toISOString().slice(0, 10)): TaxRate {
    const rates = this.pack(code).vatRates;
    const match = rates.find((r) =>
      r.effectiveFrom <= onDate && (r.effectiveTo === null || onDate < r.effectiveTo),
    );
    if (!match) throw new NoEffectiveTaxRateError(code, onDate);
    return match;
  }

  /** Convenience: the standard VAT percentage effective on a date. */
  standardVatPercent(code: CountryCode, onDate?: string): number {
    return this.vatRateOn(code, onDate).percent;
  }
}

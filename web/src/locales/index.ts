// VAKA locale framework (PI18N-001).
//
// English (`app.en.ts` / `home.en.ts`) is the authoritative baseline dictionary.
// ChiShona (sn) and isiNdebele (nd) are partial override dictionaries that are
// deep-merged over English at runtime; any key a translation does not provide
// falls back to English, so partial coverage never breaks the interface.
//
// Design constraints honoured here:
// - Several modules capture subtree references at module scope
//   (e.g. `const copy = appEnglish.stepUp`). The active dictionary is therefore
//   updated IN PLACE, preserving object identity at every level, so captured
//   references always resolve to the active language on the next render.
// - Keys never appear or disappear across languages: overrides only replace
//   string values (or whole arrays) that already exist in English.
// - The stored preference is shared with the public landing page
//   (`vaka_home_language`) so one choice follows the user into the workspace.
//
// Translation status: sn/nd content is a DRAFT pending certified native-speaker
// review (missions PI18N-002 / PI18N-003). English remains authoritative.

import { appEnglish } from "./app.en";
import { HOME_EN, type HomeCopy } from "./home.en";
import { APP_SN } from "./app.sn";
import { APP_ND } from "./app.nd";
import { HOME_SN } from "./home.sn";
import { HOME_ND } from "./home.nd";

export type LocaleCode = "en" | "sn" | "nd";

/** Widens the literal types of the `as const` English dictionaries. */
type Widen<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? Widen<U>[]
    : T extends object
      ? { -readonly [K in keyof T]: Widen<T[K]> }
      : T;

export type AppDictionary = Widen<typeof appEnglish>;
export type HomeDictionary = Widen<typeof HOME_EN>;

/** Partial override: strings replaced individually, arrays replaced wholesale. */
export type DeepPartial<T> = T extends (infer U)[]
  ? U[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

export type AppOverride = DeepPartial<AppDictionary>;
export type HomeOverride = DeepPartial<HomeDictionary>;

export const SUPPORTED_LOCALES: readonly LocaleCode[] = ["en", "sn", "nd"];

/** Native-language display names for the language switcher. */
export const LOCALE_LABELS: Record<LocaleCode, string> = {
  en: "English",
  sn: "ChiShona",
  nd: "isiNdebele",
};

// Shared with the public landing page language selector.
const STORAGE_KEY = "vaka_home_language";

const APP_OVERRIDES: Record<LocaleCode, AppOverride> = { en: {}, sn: APP_SN, nd: APP_ND };
const HOME_OVERRIDES: Record<LocaleCode, HomeOverride> = { en: {}, sn: HOME_SN, nd: HOME_ND };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Defence in depth: dictionary keys are static, but guard traversals against
// prototype-polluting key names anyway (CodeQL js/prototype-pollution).
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function safeKeys(record: Record<string, unknown>): string[] {
  return Object.keys(record).filter((key) => !UNSAFE_KEYS.has(key));
}

function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => clone(item)) as unknown as T;
  if (isRecord(value)) {
    const out: Record<string, unknown> = Object.create(null);
    for (const key of safeKeys(value)) out[key] = clone(value[key]);
    return out as T;
  }
  return value;
}

/** Deep-merge an override onto the English baseline into a fresh object. */
function merge(base: unknown, override: unknown): unknown {
  if (override === undefined) return clone(base);
  if (isRecord(base) && isRecord(override)) {
    const out: Record<string, unknown> = Object.create(null);
    for (const key of safeKeys(base)) out[key] = merge(base[key], override[key]);
    return out;
  }
  return clone(override);
}

/**
 * Overwrite `target` with `source` IN PLACE, preserving object identity at
 * every level so module-scope subtree captures stay live.
 */
function overwriteInPlace(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const key of safeKeys(source)) {
    if (!Object.prototype.hasOwnProperty.call(target, key)) continue;
    const next = source[key];
    const existing = target[key];
    if (isRecord(next) && isRecord(existing)) overwriteInPlace(existing, next);
    else target[key] = next;
  }
}

function readStoredLocale(): LocaleCode {
  try {
    if (typeof window === "undefined") return "en";
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return SUPPORTED_LOCALES.includes(stored as LocaleCode) ? (stored as LocaleCode) : "en";
  } catch {
    return "en";
  }
}

let activeLocale: LocaleCode = readStoredLocale();
const listeners = new Set<() => void>();

/**
 * The live application dictionary. Import this (aliased as `appEnglish` at
 * existing call sites) instead of the raw English file; it always reflects the
 * active language, with English fallback for untranslated keys.
 */
export const appStrings = merge(appEnglish, APP_OVERRIDES[activeLocale]) as AppDictionary;

function applyLocale(): void {
  const next = merge(appEnglish, APP_OVERRIDES[activeLocale]) as Record<string, unknown>;
  overwriteInPlace(appStrings as unknown as Record<string, unknown>, next);
  if (typeof document !== "undefined") {
    document.documentElement.lang = activeLocale;
    document.documentElement.dataset.preferredLanguage = activeLocale;
  }
}

export function getLocale(): LocaleCode {
  return activeLocale;
}

export function setLocale(code: LocaleCode): void {
  if (!SUPPORTED_LOCALES.includes(code) || code === activeLocale) return;
  activeLocale = code;
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // Preference persistence is best-effort only.
  }
  applyLocale();
  for (const listener of listeners) listener();
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Public landing page copy for a specific locale, with English fallback. */
export function homeCopyFor(code: LocaleCode): HomeCopy {
  return merge(HOME_EN, HOME_OVERRIDES[code]) as HomeCopy;
}

// Initialise document language for the stored preference on first load.
applyLocale();

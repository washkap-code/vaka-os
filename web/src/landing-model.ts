export type HomeLocale = "en" | "sn" | "nd";

const HOME_LOCALES = new Set<HomeLocale>(["en", "sn", "nd"]);

export const HOME_NAVIGATION_IDS = ["product", "outcomes", "why", "pricing", "faq"] as const;

export function resolveHomeLocale(storedLocale: string | null, browserLocale: string): HomeLocale {
  if (storedLocale && HOME_LOCALES.has(storedLocale as HomeLocale)) return storedLocale as HomeLocale;

  const normalisedBrowserLocale = browserLocale.trim().toLowerCase();
  if (normalisedBrowserLocale.startsWith("sn")) return "sn";
  if (normalisedBrowserLocale.startsWith("nd")) return "nd";
  return "en";
}

export function nextHomepageTabIndex(key: string, currentIndex: number, tabCount: number): number | null {
  if (!Number.isInteger(currentIndex) || currentIndex < 0 || tabCount < 1 || currentIndex >= tabCount) return null;
  if (key === "ArrowRight") return (currentIndex + 1) % tabCount;
  if (key === "ArrowLeft") return (currentIndex - 1 + tabCount) % tabCount;
  if (key === "Home") return 0;
  if (key === "End") return tabCount - 1;
  return null;
}

const SKU_MAX_LENGTH = 24;

export function suggestProductSku(name: string, existingSkus: readonly string[]): string {
  const words = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .match(/[A-Z0-9]+/g) ?? [];
  const base = (words.length > 1 ? words.map((word) => word.slice(0, 5)).join("-") : words[0] ?? "ITEM")
    .slice(0, SKU_MAX_LENGTH)
    .replace(/-+$/g, "") || "ITEM";
  const used = new Set(existingSkus.map((sku) => sku.trim().toUpperCase()));
  if (!used.has(base)) return base;
  for (let sequence = 2; sequence <= 9_999; sequence += 1) {
    const suffix = `-${String(sequence).padStart(3, "0")}`;
    const candidate = `${base.slice(0, SKU_MAX_LENGTH - suffix.length).replace(/-+$/g, "")}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base.slice(0, SKU_MAX_LENGTH - 5)}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

export function isPositiveStockQuantity(value: string): boolean {
  return /^(?:0*[1-9]\d*)(?:\.\d{1,3})?$|^0*\.\d{1,3}$/.test(value.trim())
    && Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= 1_000_000;
}

export function isNonNegativeMoney(value: string): boolean {
  return /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value.trim());
}

export function isPositiveMoney(value: string): boolean {
  return isNonNegativeMoney(value) && Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= 1_000_000_000;
}

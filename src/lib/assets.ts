export type Product = {
  productId: string;
  name: string;
  category: string;
  currency: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Valuation = {
  date: string;
  productId: string;
  amount: number;
  note: string;
  updatedAt: string;
};

export type AssetDataset = {
  headers: string[];
  valueHeaders: string[];
  rows: AssetRow[];
};

export type AssetRow = {
  index: number;
  label: string;
  raw: Record<string, string>;
  numeric: Record<string, number>;
};

export type AssetsResponse = {
  products: Product[];
  valuations: Valuation[];
  dataset: AssetDataset;
};

export const DEFAULT_CATEGORY = "Uncategorized";
export const DEFAULT_CURRENCY = "JPY";
export const TOTAL_HEADER = "合計";
export const AGGREGATE_PRODUCT_NAMES = new Set(["合計", "総計", "total"]);

export function buildDataset(
  products: Product[],
  valuations: Valuation[],
): AssetDataset {
  const activeProducts = products.filter((product) => product.active);
  const productById = new Map(activeProducts.map((product) => [product.productId, product]));
  const dateSet = new Set<string>();
  const valuationMap = new Map<string, Valuation>();

  for (const valuation of valuations) {
    if (productById.has(valuation.productId)) {
      const displayDate = formatDisplayDate(valuation.date);
      dateSet.add(displayDate);
      valuationMap.set(`${displayDate}:${valuation.productId}`, valuation);
    }
  }

  const dates = Array.from(dateSet).sort((a, b) => a.localeCompare(b));
  const valueHeaders = activeProducts.map((product) => product.name);
  const headers = ["日付", ...valueHeaders, TOTAL_HEADER];
  const latestByProduct = new Map<string, number>();
  const rows: AssetRow[] = dates.map((date, index) => {
    const raw: Record<string, string> = { 日付: date };
    const numeric: Record<string, number> = {};
    let total = 0;

    for (const product of activeProducts) {
      const valuation = valuationMap.get(`${date}:${product.productId}`);
      if (valuation) {
        latestByProduct.set(product.productId, valuation.amount);
      }
      const value = latestByProduct.get(product.productId) ?? 0;
      raw[product.name] = String(value);
      numeric[product.name] = value;
      total += value;
    }

    raw[TOTAL_HEADER] = String(total);
    numeric[TOTAL_HEADER] = total;

    return {
      index,
      label: date,
      raw,
      numeric,
    };
  });

  return {
    headers,
    valueHeaders,
    rows,
  };
}

export function createProductId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${slug || "product"}-${suffix}`;
}

export function isImportableProductName(name: string): boolean {
  const normalized = name.trim();
  return Boolean(normalized) && !AGGREGATE_PRODUCT_NAMES.has(normalized.toLowerCase());
}

export function normaliseDate(value: string): string | null {
  const trimmed = value.trim();
  const slashMatch = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(trimmed);
  const hyphenMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  const match = slashMatch ?? hyphenMatch;
  if (!match) {
    return null;
  }

  const year = match[1];
  const month = match[2].padStart(2, "0");
  const day = match[3].padStart(2, "0");
  const candidate = `${year}-${month}-${day}`;
  const parsed = new Date(`${candidate}T00:00:00.000Z`);
  if (
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() + 1 !== Number(month) ||
    parsed.getUTCDate() !== Number(day)
  ) {
    return null;
  }

  return candidate;
}

export function formatDisplayDate(value: string): string {
  const normalised = normaliseDate(value);
  return normalised ? normalised.replace(/-/g, "/") : value;
}

export function normaliseNumber(value: string): number {
  const sanitised = value.replace(/[^0-9+\-.,]/g, "").replace(/,/g, "");
  const parsed = Number(sanitised);
  return Number.isFinite(parsed) ? parsed : 0;
}

import {
  DEFAULT_CATEGORY,
  DEFAULT_CURRENCY,
  Product,
  Valuation,
  createProductId,
  isImportableProductName,
  normaliseDate,
  normaliseNumber,
} from "./assets";

export type ImportedAssets = {
  products: Product[];
  valuations: Valuation[];
};

export function parseAssetCsv(text: string): ImportedAssets {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    throw new Error("CSVにデータが見つかりませんでした。");
  }

  const headers = splitCsvLine(lines[0]);
  if (headers.length < 2) {
    throw new Error("ヘッダー行を確認してください。少なくとも2列が必要です。");
  }

  const now = new Date().toISOString();
  const productColumns = headers
    .map((name, index) => ({ name: name.trim(), index }))
    .slice(1)
    .filter(({ name }) => isImportableProductName(name));
  const products = productColumns.map<Product>(({ name }) => ({
    productId: createProductId(name),
    name,
    category: DEFAULT_CATEGORY,
    currency: DEFAULT_CURRENCY,
    active: true,
    createdAt: now,
    updatedAt: now,
  }));
  const valuations: Valuation[] = [];

  for (let index = 1; index < lines.length; index += 1) {
    const cells = splitCsvLine(lines[index]);
    const rawDate = cells[0]?.trim();
    if (!rawDate) {
      continue;
    }
    const date = normaliseDate(rawDate);
    if (!date) {
      throw new Error(`${index + 1}行目の日付は YYYY/MM/DD 形式にしてください。`);
    }

    productColumns.forEach(({ index: columnIndex }, productIndex) => {
      const rawAmount = cells[columnIndex] ?? "";
      if (!rawAmount.trim()) {
        return;
      }
      const product = products[productIndex];
      valuations.push({
        date,
        productId: product.productId,
        amount: normaliseNumber(rawAmount),
        note: "CSV import",
        updatedAt: now,
      });
    });
  }

  return { products, valuations };
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === `"`) {
      if (inQuotes && line[i + 1] === `"`) {
        current += `"`;
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

import "server-only";

import {
  AssetsResponse,
  DEFAULT_CATEGORY,
  DEFAULT_CURRENCY,
  Product,
  Valuation,
  buildDataset,
  createProductId,
  isImportableProductName,
} from "./assets";
import { ImportedAssets } from "./csv";

const PRODUCTS_TABLE = "products";
const VALUATIONS_TABLE = "valuations";

type ProductInput = {
  productId?: string;
  name: string;
  category?: string;
  currency?: string;
  active?: boolean;
};

type ValuationInput = {
  date: string;
  productId: string;
  amount: number;
  note?: string;
};

type DbProduct = {
  product_id: string;
  name: string;
  category: string | null;
  currency: string | null;
  active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

type DbValuation = {
  date: string;
  product_id: string;
  amount: number | string;
  note: string | null;
  updated_at: string | null;
};

export async function getAssets(): Promise<AssetsResponse> {
  const [products, valuations] = await Promise.all([
    readProducts(),
    readValuations(),
  ]);

  return {
    products,
    valuations,
    dataset: buildDataset(products, valuations),
  };
}

export async function upsertProduct(input: ProductInput): Promise<Product> {
  const now = new Date().toISOString();
  const name = input.name.trim();
  if (!name) {
    throw new Error("金融商品名を入力してください。");
  }

  const products = await readProducts();
  const existing = input.productId
    ? products.find((product) => product.productId === input.productId)
    : products.find((product) => product.name === name);
  const duplicate = products.find(
    (product) =>
      product.name === name &&
      product.productId !== existing?.productId,
  );
  if (duplicate) {
    throw new Error("同じ名前の金融商品がすでに存在します。");
  }

  const product: Product = {
    productId: existing?.productId ?? createProductId(name),
    name,
    category: input.category?.trim() || DEFAULT_CATEGORY,
    currency: input.currency?.trim() || DEFAULT_CURRENCY,
    active: input.active ?? existing?.active ?? true,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  const [saved] = await supabaseRequest<DbProduct[]>(
    `${PRODUCTS_TABLE}?on_conflict=product_id`,
    {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify([toDbProduct(product)]),
    },
  );

  return fromDbProduct(saved);
}

export async function upsertValuation(input: ValuationInput): Promise<Valuation> {
  const valuation: Valuation = {
    date: input.date,
    productId: input.productId,
    amount: input.amount,
    note: input.note?.trim() ?? "",
    updatedAt: new Date().toISOString(),
  };
  const [saved] = await supabaseRequest<DbValuation[]>(
    `${VALUATIONS_TABLE}?on_conflict=date,product_id`,
    {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify([toDbValuation(valuation)]),
    },
  );

  return fromDbValuation(saved);
}

export async function deleteValuation(date: string, productId: string): Promise<void> {
  await supabaseRequest(
    `${VALUATIONS_TABLE}?date=eq.${encodeURIComponent(date)}&product_id=eq.${encodeURIComponent(productId)}`,
    {
      method: "DELETE",
    },
  );
}

export async function importAssets(imported: ImportedAssets) {
  const existingProducts = await readProducts();
  const productByName = new Map(existingProducts.map((product) => [product.name, product]));
  const products = imported.products.map((product) => {
    const existing = productByName.get(product.name);
    return existing
      ? {
          ...existing,
          category: existing.category || product.category,
          currency: existing.currency || product.currency,
          active: true,
          updatedAt: new Date().toISOString(),
        }
      : product;
  });
  const importedProductById = new Map(
    imported.products.map((product, index) => [product.productId, products[index]]),
  );
  const valuations = imported.valuations.map((valuation) => ({
    ...valuation,
    productId:
      importedProductById.get(valuation.productId)?.productId ??
      valuation.productId,
  }));

  if (products.length > 0) {
    await supabaseRequest(
      `${PRODUCTS_TABLE}?on_conflict=product_id`,
      {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify(products.map(toDbProduct)),
      },
    );
  }

  if (valuations.length > 0) {
    await supabaseRequest(
      `${VALUATIONS_TABLE}?on_conflict=date,product_id`,
      {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify(valuations.map(toDbValuation)),
      },
    );
  }

  return {
    productCount: products.length,
    valuationCount: valuations.length,
  };
}

async function readProducts(): Promise<Product[]> {
  const rows = await supabaseRequest<DbProduct[]>(
    `${PRODUCTS_TABLE}?select=*&order=name.asc`,
  );
  return rows.map(fromDbProduct).filter((product) => isImportableProductName(product.name));
}

async function readValuations(): Promise<Valuation[]> {
  const rows = await supabaseRequest<DbValuation[]>(
    `${VALUATIONS_TABLE}?select=*&order=date.asc`,
  );
  return rows.map(fromDbValuation);
}

async function supabaseRequest<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "web/.env.local に SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください。",
    );
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(formatSupabaseError(text));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

function formatSupabaseError(text: string): string {
  if (!text) {
    return "Supabaseへのアクセスに失敗しました。";
  }

  try {
    const error = JSON.parse(text) as { code?: string; message?: string };
    if (error.code === "PGRST205") {
      return "Supabaseに必要なテーブルがありません。READMEまたは supabase/schema.sql のSQLをSupabase SQL Editorで実行してください。";
    }
    return error.message ? `Supabaseエラー: ${error.message}` : text;
  } catch {
    return text;
  }
}

function fromDbProduct(row: DbProduct): Product {
  return {
    productId: row.product_id,
    name: row.name,
    category: row.category || DEFAULT_CATEGORY,
    currency: row.currency || DEFAULT_CURRENCY,
    active: row.active ?? true,
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
  };
}

function fromDbValuation(row: DbValuation): Valuation {
  return {
    date: row.date,
    productId: row.product_id,
    amount: Number(row.amount),
    note: row.note ?? "",
    updatedAt: row.updated_at ?? "",
  };
}

function toDbProduct(product: Product): DbProduct {
  return {
    product_id: product.productId,
    name: product.name,
    category: product.category,
    currency: product.currency,
    active: product.active,
    created_at: product.createdAt,
    updated_at: product.updatedAt,
  };
}

function toDbValuation(valuation: Valuation): DbValuation {
  return {
    date: valuation.date,
    product_id: valuation.productId,
    amount: valuation.amount,
    note: valuation.note,
    updated_at: valuation.updatedAt,
  };
}

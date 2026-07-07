"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AssetDataset,
  AssetRow,
  AssetsResponse,
  DEFAULT_CATEGORY,
  DEFAULT_CURRENCY,
  Product,
  TOTAL_HEADER,
  Valuation,
  formatDisplayDate,
} from "@/lib/assets";

type SortDirection = "asc" | "desc";

type SortConfig = {
  column: string;
  direction: SortDirection;
};

type ProductFormState = {
  productId?: string;
  name: string;
  category: string;
  currency: string;
  active: boolean;
};

type ValuationFormState = {
  date: string;
  note: string;
};

type ValuationEditState = {
  amount: string;
  note: string;
};

type HistoryLimit = "25" | "50" | "100" | "all";

const emptyProductForm: ProductFormState = {
  name: "",
  category: DEFAULT_CATEGORY,
  currency: DEFAULT_CURRENCY,
  active: true,
};
const emptyProducts: Product[] = [];

function getSavedPassword() {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem("asset-manager-password")?.trim() ?? "";
}

export function AssetDashboard() {
  const [appPassword, setAppPassword] = useState(getSavedPassword);
  const [passwordInput, setPasswordInput] = useState(getSavedPassword);
  const [data, setData] = useState<AssetsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("未読み込み");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [csvFileName, setCsvFileName] = useState<string>("");
  const [csvText, setCsvText] = useState("");
  const [startLabel, setStartLabel] = useState<string | undefined>();
  const [endLabel, setEndLabel] = useState<string | undefined>();
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    column: "日付",
    direction: "desc",
  });
  const [productForm, setProductForm] = useState<ProductFormState>(emptyProductForm);
  const [valuationForm, setValuationForm] = useState<ValuationFormState>({
    date: getToday(),
    note: "",
  });
  const [valuationAmounts, setValuationAmounts] = useState<Record<string, string>>({});

  const loadAssets = useCallback(async (password = appPassword) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/assets", {
        cache: "no-store",
        headers: {
          "x-app-password": password.trim(),
        },
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message ?? "資産データの読み込みに失敗しました。");
      }

      const nextData = payload as AssetsResponse;
      setData(nextData);
      setStatus(`最終読み込み: ${formatDateTime(new Date())}`);
      setSortConfig((current) => ({
        column: current.column || nextData.dataset.headers[0] || "日付",
        direction: current.direction,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "資産データの読み込みに失敗しました。");
      setStatus("読み込み失敗");
    } finally {
      setIsLoading(false);
    }
  }, [appPassword]);

  useEffect(() => {
    if (appPassword) {
      const timerId = window.setTimeout(() => {
        void loadAssets(appPassword);
      }, 0);
      return () => window.clearTimeout(timerId);
    }
  }, [appPassword, loadAssets]);

  const handlePasswordSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextPassword = passwordInput.trim();
    window.localStorage.setItem("asset-manager-password", nextPassword);
    setPasswordInput(nextPassword);
    setAppPassword(nextPassword);
  };

  const handleCsvChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setCsvFileName(file.name);
    setCsvText(await file.text());
    event.target.value = "";
  };

  const handleImportSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await sendJson(
        "/api/import",
        "POST",
        { csv: csvText },
        appPassword,
      );
      setNotice(
        `CSVを取り込みました。商品 ${result.productCount} 件、評価額 ${result.valuationCount} 件。`,
      );
      setCsvFileName("");
      setCsvText("");
      await loadAssets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "CSVインポートに失敗しました。");
    } finally {
      setIsSaving(false);
    }
  };

  const handleProductSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await sendJson("/api/products", "POST", productForm, appPassword);
      setProductForm(emptyProductForm);
      await loadAssets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "金融商品の保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  };

  const handleValuationSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const entries = Object.entries(valuationAmounts).filter(([, amount]) => amount.trim());
    if (entries.length === 0) {
      setError("保存する評価額を入力してください。");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await Promise.all(
        entries.map(([productId, amount]) =>
          sendJson(
            "/api/valuations",
            "PUT",
            {
              date: valuationForm.date,
              productId,
              amount: Number(amount.replace(/,/g, "")),
              note: valuationForm.note,
            },
            appPassword,
          ),
        ),
      );
      setNotice(`${entries.length}件の評価額を保存しました。`);
      setValuationAmounts({});
      setValuationForm((current) => ({ ...current, note: "" }));
      await loadAssets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "評価額の保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  };

  const dataset = data?.dataset ?? null;
  const products = data?.products ?? emptyProducts;
  const activeProducts = products.filter((product) => product.active);
  const availableLabels = useMemo(
    () => dataset?.rows.map((row) => row.label) ?? [],
    [dataset],
  );
  const productById = useMemo(
    () => new Map(products.map((product) => [product.productId, product])),
    [products],
  );
  const latestValuationByProductId = useMemo(() => {
    const result: Record<string, Valuation> = {};
    for (const valuation of data?.valuations ?? []) {
      const current = result[valuation.productId];
      if (!current || valuation.date.localeCompare(current.date) > 0) {
        result[valuation.productId] = valuation;
      }
    }
    return result;
  }, [data]);
  const categoryAssignments = useMemo(() => {
    return products.reduce<Record<string, string>>((acc, product) => {
      acc[product.name] = product.category || DEFAULT_CATEGORY;
      return acc;
    }, {});
  }, [products]);

  const filteredRows = useMemo(() => {
    if (!dataset) {
      return [];
    }

    let startIndex = 0;
    let endIndex = dataset.rows.length - 1;
    if (startLabel) {
      const index = dataset.rows.findIndex((row) => row.label === startLabel);
      if (index >= 0) {
        startIndex = index;
      }
    }
    if (endLabel) {
      const index = dataset.rows.findIndex((row) => row.label === endLabel);
      if (index >= 0) {
        endIndex = index;
      }
    }
    if (startIndex > endIndex) {
      [startIndex, endIndex] = [endIndex, startIndex];
    }
    return dataset.rows.slice(startIndex, endIndex + 1);
  }, [dataset, startLabel, endLabel]);

  const sortedRows = useMemo(() => {
    if (!dataset) {
      return [];
    }

    const column = sortConfig.column || dataset.headers[0];
    const rows = [...filteredRows];
    const isNumericColumn = dataset.valueHeaders.includes(column) || column === TOTAL_HEADER;
    rows.sort((a, b) => {
      if (isNumericColumn) {
        const diff = (a.numeric[column] ?? 0) - (b.numeric[column] ?? 0);
        return sortConfig.direction === "asc" ? diff : -diff;
      }
      const aValue = a.raw[column] ?? "";
      const bValue = b.raw[column] ?? "";
      return sortConfig.direction === "asc"
        ? aValue.localeCompare(bValue, "ja")
        : bValue.localeCompare(aValue, "ja");
    });
    return rows;
  }, [dataset, filteredRows, sortConfig]);

  const latestRowsByAsset = useMemo(() => {
    if (!dataset) {
      return {};
    }
    return dataset.valueHeaders.reduce<Record<string, number>>((acc, header) => {
      const latestRow = [...filteredRows]
        .reverse()
        .find((row) => row.numeric[header] !== undefined);
      acc[header] = latestRow?.numeric[header] ?? 0;
      return acc;
    }, {});
  }, [dataset, filteredRows]);

  const assetTotalsList = useMemo(() => {
    return Object.entries(latestRowsByAsset)
      .map(([label, value]) => ({
        label,
        value,
        category: categoryAssignments[label] ?? DEFAULT_CATEGORY,
      }))
      .sort((a, b) => b.value - a.value);
  }, [latestRowsByAsset, categoryAssignments]);

  const categoryTotalsList = useMemo(() => {
    const totals = assetTotalsList.reduce<Record<string, number>>((acc, item) => {
      acc[item.category] = (acc[item.category] ?? 0) + item.value;
      return acc;
    }, {});
    return Object.entries(totals)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [assetTotalsList]);

  const timelineData = useMemo(() => {
    if (!dataset) {
      return [];
    }
    return filteredRows.map((row) => ({
      label: row.label,
      value: row.numeric[TOTAL_HEADER] ?? 0,
    }));
  }, [dataset, filteredRows]);
  const latestTotal = timelineData.at(-1);

  const handleValuationUpdate = async (
    valuation: Valuation,
    nextState: ValuationEditState,
  ): Promise<boolean> => {
    const amount = Number(nextState.amount.replace(/,/g, ""));
    if (!Number.isFinite(amount)) {
      setError("評価額を数値で入力してください。");
      return false;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      await sendJson(
        "/api/valuations",
        "PUT",
        {
          date: valuation.date,
          productId: valuation.productId,
          amount,
          note: nextState.note,
        },
        appPassword,
      );
      setNotice("評価額を更新しました。");
      await loadAssets();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "評価額の更新に失敗しました。");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleValuationDelete = async (valuation: Valuation) => {
    const productName = productById.get(valuation.productId)?.name ?? valuation.productId;
    if (!window.confirm(`${valuation.date} の ${productName} の評価額を削除しますか？`)) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      await sendJson(
        "/api/valuations",
        "DELETE",
        {
          date: valuation.date,
          productId: valuation.productId,
        },
        appPassword,
      );
      setNotice("評価額を削除しました。");
      await loadAssets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "評価額の削除に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  };

  const editProduct = (product: Product) => {
    setProductForm({
      productId: product.productId,
      name: product.name,
      category: product.category,
      currency: product.currency,
      active: product.active,
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              資産管理
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              CSVを初回取り込みし、その後はSupabase上のデータを直接読み書きします。
            </p>
            <p className="mt-1 text-xs text-slate-500">{status}</p>
          </div>
          <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-2 sm:flex-row">
            <input
              type="password"
              className="h-10 rounded-md border border-slate-300 px-3 text-sm"
              value={passwordInput}
              onChange={(event) => setPasswordInput(event.target.value)}
              placeholder="アプリパスワード"
            />
            <button
              type="submit"
              className="h-10 rounded-md bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              接続
            </button>
            <button
              type="button"
              className="h-10 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
              onClick={() => void loadAssets()}
              disabled={!appPassword || isLoading || isSaving}
            >
              {isLoading ? "読み込み中" : "更新"}
            </button>
          </form>
        </div>
        {error ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {notice}
          </p>
        ) : null}
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CsvImportForm
          fileName={csvFileName}
          hasCsv={Boolean(csvText)}
          isSaving={isSaving}
          onFileChange={handleCsvChange}
          onSubmit={handleImportSubmit}
        />
        <ProductForm
          form={productForm}
          isSaving={isSaving}
          onChange={setProductForm}
          onSubmit={handleProductSubmit}
          onCancel={() => setProductForm(emptyProductForm)}
        />
      </section>

      <section>
        <ValuationForm
          form={valuationForm}
          products={activeProducts}
          amounts={valuationAmounts}
          latestValuationByProductId={latestValuationByProductId}
          isSaving={isSaving}
          onChange={setValuationForm}
          onAmountChange={(productId, amount) =>
            setValuationAmounts((current) => ({
              ...current,
              [productId]: amount,
            }))
          }
          onSubmit={handleValuationSubmit}
        />
      </section>

      {data ? (
        <section className="space-y-8">
          <ProductList products={products} onEdit={editProduct} />

          {dataset ? (
            <>
              <FiltersPanel
                labels={availableLabels}
                startLabel={startLabel ?? ""}
                endLabel={endLabel ?? ""}
                sortConfig={sortConfig}
                setStartLabel={setStartLabel}
                setEndLabel={setEndLabel}
                onChangeSort={setSortConfig}
                dataset={dataset}
              />

              <SummaryPanels
                latestTotal={latestTotal}
                categoryTotals={categoryTotalsList}
                assetTotals={assetTotalsList}
              />

              <ChartSection
                categoryData={categoryTotalsList}
                assetData={assetTotalsList}
              />

              <TimelineChart data={timelineData} />

              <TotalHistory data={timelineData} />

              <ValuationHistory
                valuations={data.valuations}
                productById={productById}
                isSaving={isSaving}
                onUpdate={handleValuationUpdate}
                onDelete={handleValuationDelete}
              />

              <DataTable dataset={dataset} rows={sortedRows} />
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function CsvImportForm({
  fileName,
  hasCsv,
  isSaving,
  onFileChange,
  onSubmit,
}: {
  fileName: string;
  hasCsv: boolean;
  isSaving: boolean;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h2 className="text-lg font-semibold text-slate-900">CSV初期取り込み</h2>
      <label className="mt-4 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center transition hover:bg-slate-100">
        <span className="text-sm font-medium text-slate-700">
          {fileName || "CSVファイルを選択"}
        </span>
        <span className="mt-1 text-xs text-slate-500">
          1列目が日付、2列目以降が金融商品
        </span>
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={onFileChange}
        />
      </label>
      <button
        type="submit"
        className="mt-5 rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-600 disabled:opacity-50"
        disabled={isSaving || !hasCsv}
      >
        {isSaving ? "取り込み中" : "DBへ取り込む"}
      </button>
    </form>
  );
}

function ProductForm({
  form,
  isSaving,
  onChange,
  onSubmit,
  onCancel,
}: {
  form: ProductFormState;
  isSaving: boolean;
  onChange: (form: ProductFormState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h2 className="text-lg font-semibold text-slate-900">
        {form.productId ? "金融商品を編集" : "金融商品を追加"}
      </h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="商品名"
          value={form.name}
          onChange={(value) => onChange({ ...form, name: value })}
          required
        />
        <TextField
          label="カテゴリ"
          value={form.category}
          onChange={(value) => onChange({ ...form, category: value })}
        />
        <TextField
          label="通貨"
          value={form.currency}
          onChange={(value) => onChange({ ...form, currency: value })}
        />
        <label className="flex items-center gap-2 pt-7 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(event) => onChange({ ...form, active: event.target.checked })}
          />
          有効
        </label>
      </div>
      <div className="mt-5 flex gap-3">
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
          disabled={isSaving}
        >
          {isSaving ? "保存中" : "保存"}
        </button>
        {form.productId ? (
          <button
            type="button"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            onClick={onCancel}
          >
            取消
          </button>
        ) : null}
      </div>
    </form>
  );
}

function ValuationForm({
  form,
  products,
  amounts,
  latestValuationByProductId,
  isSaving,
  onChange,
  onAmountChange,
  onSubmit,
}: {
  form: ValuationFormState;
  products: Product[];
  amounts: Record<string, string>;
  latestValuationByProductId: Record<string, Valuation>;
  isSaving: boolean;
  onChange: (form: ValuationFormState) => void;
  onAmountChange: (productId: string, amount: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h2 className="text-lg font-semibold text-slate-900">金融商品ごとの評価額入力</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextField
          label="日付"
          placeholder="YYYY/MM/DD"
          value={form.date}
          onChange={(value) => onChange({ ...form, date: value })}
          required
        />
        <TextField
          label="メモ"
          value={form.note}
          onChange={(value) => onChange({ ...form, note: value })}
        />
      </div>

      <div className="mt-5 max-h-96 overflow-y-auto rounded-lg border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="sticky top-0 bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-slate-600">金融商品</th>
              <th className="px-4 py-2 text-right font-medium text-slate-600">直近評価額</th>
              <th className="px-4 py-2 text-left font-medium text-slate-600">今回の評価額</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {products.map((product) => {
              const latest = latestValuationByProductId[product.productId];
              return (
                <tr key={product.productId}>
                  <td className="px-4 py-2 text-slate-700">
                    <div className="font-medium">{product.name}</div>
                    <div className="text-xs text-slate-500">{product.category}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right text-slate-600">
                    {latest ? (
                      <>
                        <div>{formatCurrency(latest.amount)}</div>
                        <div className="text-xs text-slate-500">{formatDisplayDate(latest.date)}</div>
                      </>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <input
                      inputMode="decimal"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={amounts[product.productId] ?? ""}
                      onChange={(event) => onAmountChange(product.productId, event.target.value)}
                      placeholder="0"
                    />
                  </td>
                </tr>
              );
            })}
            {products.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                  有効な金融商品がありません。
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <button
        type="submit"
        className="mt-5 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-50"
        disabled={isSaving || products.length === 0}
      >
        {isSaving ? "保存中" : "入力した評価額を保存"}
      </button>
    </form>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  placeholder,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: "decimal";
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        required={required}
      />
    </label>
  );
}

function ProductList({
  products,
  onEdit,
}: {
  products: Product[];
  onEdit: (product: Product) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">金融商品</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-slate-600">商品名</th>
              <th className="px-4 py-2 text-left font-medium text-slate-600">カテゴリ</th>
              <th className="px-4 py-2 text-left font-medium text-slate-600">通貨</th>
              <th className="px-4 py-2 text-left font-medium text-slate-600">状態</th>
              <th className="px-4 py-2 text-left font-medium text-slate-600">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products.map((product) => (
              <tr key={product.productId}>
                <td className="whitespace-nowrap px-4 py-2 text-slate-700">{product.name}</td>
                <td className="whitespace-nowrap px-4 py-2 text-slate-700">{product.category}</td>
                <td className="whitespace-nowrap px-4 py-2 text-slate-700">{product.currency}</td>
                <td className="whitespace-nowrap px-4 py-2 text-slate-700">
                  {product.active ? "有効" : "無効"}
                </td>
                <td className="whitespace-nowrap px-4 py-2">
                  <button
                    type="button"
                    className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 transition hover:bg-slate-100"
                    onClick={() => onEdit(product)}
                  >
                    編集
                  </button>
                </td>
              </tr>
            ))}
            {products.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  金融商品がありません。
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FiltersPanel({
  labels,
  startLabel,
  endLabel,
  dataset,
  sortConfig,
  setStartLabel,
  setEndLabel,
  onChangeSort,
}: {
  labels: string[];
  startLabel: string;
  endLabel: string;
  dataset: AssetDataset;
  sortConfig: SortConfig;
  setStartLabel: (value: string | undefined) => void;
  setEndLabel: (value: string | undefined) => void;
  onChangeSort: (config: SortConfig) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">期間と並び替え</h2>
      <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end">
        <SelectField
          label="開始"
          value={startLabel}
          onChange={(value) => setStartLabel(value || undefined)}
          options={labels}
          emptyLabel="最初の行"
        />
        <SelectField
          label="終了"
          value={endLabel}
          onChange={(value) => setEndLabel(value || undefined)}
          options={labels}
          emptyLabel="最後の行"
        />
        <SelectField
          label="並び替え"
          value={sortConfig.column}
          onChange={(column) =>
            onChangeSort({ column, direction: sortConfig.direction })
          }
          options={dataset.headers}
        />
        <button
          type="button"
          className="h-10 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          onClick={() =>
            onChangeSort({
              column: sortConfig.column,
              direction: sortConfig.direction === "asc" ? "desc" : "asc",
            })
          }
        >
          {sortConfig.direction === "asc" ? "昇順" : "降順"}
        </button>
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  emptyLabel,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  emptyLabel?: string;
}) {
  return (
    <label className="block flex-1 text-sm font-medium text-slate-700">
      {label}
      <select
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {emptyLabel ? <option value="">{emptyLabel}</option> : null}
        {options.map((option, index) => (
          <option key={`${label}-${option}-${index}`} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

type TotalsEntry = {
  label: string;
  value: number;
};

type AssetTotalsEntry = TotalsEntry & {
  category: string;
};

function SummaryPanels({
  latestTotal,
  categoryTotals,
  assetTotals,
}: {
  latestTotal?: TotalsEntry;
  categoryTotals: TotalsEntry[];
  assetTotals: AssetTotalsEntry[];
}) {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">最新合計評価額</h3>
        <p className="mt-3 text-3xl font-semibold text-slate-900">
          {latestTotal ? formatCurrency(latestTotal.value) : "-"}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          {latestTotal ? `${latestTotal.label} 時点` : "データがありません。"}
        </p>
      </div>
      <SummaryList title="カテゴリ別 最新評価額" items={categoryTotals} />
      <SummaryList title="資産別 最新評価額" items={assetTotals} />
    </div>
  );
}

function SummaryList({
  title,
  items,
}: {
  title: string;
  items: Array<TotalsEntry & { category?: string }>;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm text-slate-700">
        {items.map((item, index) => (
          <li
            key={`${title}-${item.label}-${index}`}
            className="flex items-center justify-between gap-4"
          >
            <span>
              {item.label}
              {item.category ? (
                <span className="ml-2 text-xs text-slate-500">({item.category})</span>
              ) : null}
            </span>
            <span className="font-semibold">{formatCurrency(item.value)}</span>
          </li>
        ))}
        {items.length === 0 ? (
          <li className="text-slate-500">データがありません。</li>
        ) : null}
      </ul>
    </div>
  );
}

function ChartSection({
  categoryData,
  assetData,
}: {
  categoryData: TotalsEntry[];
  assetData: AssetTotalsEntry[];
}) {
  const [view, setView] = useState<"category" | "asset">("category");
  const chartItems = view === "category" ? categoryData : assetData;
  const maxValue = chartItems.reduce((acc, item) => Math.max(acc, item.value), 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-lg font-semibold text-slate-900">
          {view === "category" ? "カテゴリ別チャート" : "資産別チャート"}
        </h3>
        <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
          {(["category", "asset"] as const).map((nextView) => (
            <button
              key={nextView}
              type="button"
              onClick={() => setView(nextView)}
              className={`px-3 py-2 text-sm font-medium transition ${
                view === nextView
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {nextView === "category" ? "カテゴリ別" : "資産別"}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-5 space-y-4">
        {chartItems.map((item, index) => {
          const ratio =
            maxValue === 0 ? 0 : Math.max(0, Math.min(100, (item.value / maxValue) * 100));
          const category =
            "category" in item && typeof item.category === "string"
              ? item.category
              : "";
          return (
            <div key={`${view}-${item.label}-${index}`} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700">{item.label}</span>
                {category ? (
                  <span className="text-xs text-slate-500">{category}</span>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-blue-500"
                    style={{ width: `${ratio}%` }}
                  />
                </div>
                <span className="w-28 text-right text-sm font-semibold text-slate-700">
                  {formatCurrency(item.value)}
                </span>
              </div>
            </div>
          );
        })}
        {chartItems.length === 0 ? (
          <p className="text-sm text-slate-500">データがありません。</p>
        ) : null}
      </div>
    </div>
  );
}

function TimelineChart({ data }: { data: TotalsEntry[] }) {
  const width = 760;
  const height = 320;
  const padding = { top: 24, right: 28, bottom: 52, left: 86 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const values = data.map((item) => item.value);
  const minValue = values.length > 0 ? Math.min(...values) : 0;
  const maxValue = values.length > 0 ? Math.max(...values) : 1;
  const range = Math.max(maxValue - minValue, 1);
  const yMin = Math.max(0, minValue - range * 0.08);
  const yMax = maxValue + range * 0.08;
  const yRange = Math.max(yMax - yMin, 1);
  const latest = data.at(-1);
  const peak = data.reduce<TotalsEntry | undefined>(
    (best, item) => (!best || item.value > best.value ? item : best),
    undefined,
  );
  const low = data.reduce<TotalsEntry | undefined>(
    (best, item) => (!best || item.value < best.value ? item : best),
    undefined,
  );
  const labelStep = data.length > 6 ? Math.ceil(data.length / 6) : 1;
  const pointStep = data.length > 24 ? Math.ceil(data.length / 24) : 1;
  const yTicks = Array.from({ length: 5 }, (_, index) => yMin + (yRange / 4) * index);
  const points = data.map((item, index) => {
    const x =
      data.length === 1
        ? innerWidth / 2
        : (innerWidth / Math.max(data.length - 1, 1)) * index;
    const y = innerHeight - ((item.value - yMin) / yRange) * innerHeight;
    return { item, x, y };
  });
  const linePath = points
    .map(({ x, y }, index) => `${index === 0 ? "M" : "L"} ${x} ${y}`)
    .join(" ");
  const areaPath =
    points.length > 0
      ? `${linePath} L ${points.at(-1)?.x ?? 0} ${innerHeight} L ${points[0].x} ${innerHeight} Z`
      : "";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">合計評価額の推移</h3>
          <p className="mt-1 text-sm text-slate-600">
            入力日ごとの商品別評価額を足し上げた合計です。
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
          <MetricChip label="最新" item={latest} />
          <MetricChip label="最高" item={peak} />
          <MetricChip label="最低" item={low} />
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        {data.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">データがありません。</p>
        ) : (
          <svg
            className="min-w-[720px]"
            width="100%"
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label="合計評価額の時系列グラフ"
          >
            <defs>
              <linearGradient id="total-chart-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#059669" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#059669" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <g transform={`translate(${padding.left},${padding.top})`}>
              {yTicks.map((tick, index) => {
                const y = innerHeight - ((tick - yMin) / yRange) * innerHeight;
                return (
                  <g key={`tick-${index}`}>
                    <line x1={0} x2={innerWidth} y1={y} y2={y} stroke="#e2e8f0" />
                    <text
                      x={-12}
                      y={y + 4}
                      textAnchor="end"
                      fontSize={11}
                      fill="#64748b"
                    >
                      {formatCompactCurrency(tick)}
                    </text>
                  </g>
                );
              })}

              {areaPath ? <path d={areaPath} fill="url(#total-chart-area)" /> : null}
              {linePath ? (
                <path
                  d={linePath}
                  fill="none"
                  stroke="#059669"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                />
              ) : null}

              {points.map(({ item, x, y }, index) => {
                const showPoint = index % pointStep === 0 || index === points.length - 1;
                const showLabel = index % labelStep === 0 || index === points.length - 1;
                return (
                  <g key={`point-${item.label}-${index}`}>
                    {showPoint ? (
                      <circle cx={x} cy={y} r={4} fill="#059669" stroke="white" strokeWidth={2}>
                        <title>{`${item.label}: ${formatCurrency(item.value)}`}</title>
                      </circle>
                    ) : null}
                    {showLabel ? (
                      <text
                        x={x}
                        y={innerHeight + 26}
                        textAnchor="middle"
                        fontSize={11}
                        fill="#475569"
                      >
                        {item.label.slice(0, 7)}
                      </text>
                    ) : null}
                  </g>
                );
              })}
              <line x1={0} x2={innerWidth} y1={innerHeight} y2={innerHeight} stroke="#cbd5e1" />
              <line x1={0} x2={0} y1={0} y2={innerHeight} stroke="#cbd5e1" />
            </g>
          </svg>
        )}
      </div>
    </div>
  );
}

function MetricChip({ label, item }: { label: string; item?: TotalsEntry }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 whitespace-nowrap text-sm font-semibold text-slate-800">
        {item ? formatCurrency(item.value) : "-"}
      </div>
      <div className="mt-1 text-xs text-slate-500">{item?.label ?? ""}</div>
    </div>
  );
}

function TotalHistory({ data }: { data: TotalsEntry[] }) {
  const rows = [...data].reverse();
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h3 className="text-lg font-semibold text-slate-900">入力日ごとの合計評価額</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-slate-600">日付</th>
              <th className="px-4 py-2 text-right font-medium text-slate-600">合計評価額</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((item) => (
              <tr key={`total-${item.label}`}>
                <td className="whitespace-nowrap px-4 py-2 text-slate-700">{item.label}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-semibold text-slate-700">
                  {formatCurrency(item.value)}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-4 py-6 text-center text-slate-500">
                  合計評価額の履歴がありません。
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ValuationHistory({
  valuations,
  productById,
  isSaving,
  onUpdate,
  onDelete,
}: {
  valuations: Valuation[];
  productById: Map<string, Product>;
  isSaving: boolean;
  onUpdate: (valuation: Valuation, nextState: ValuationEditState) => Promise<boolean>;
  onDelete: (valuation: Valuation) => Promise<void>;
}) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editState, setEditState] = useState<ValuationEditState>({
    amount: "",
    note: "",
  });
  const [query, setQuery] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [limit, setLimit] = useState<HistoryLimit>("50");
  const rows = [...valuations].sort((a, b) => b.date.localeCompare(a.date));
  const productOptions = Array.from(
    new Map(
      valuations.map((valuation) => [
        valuation.productId,
        productById.get(valuation.productId)?.name ?? valuation.productId,
      ]),
    ),
  ).sort(([, aName], [, bName]) => aName.localeCompare(bName, "ja"));
  const latestDate = rows[0]?.date;
  const queryText = query.trim().toLowerCase();
  const filteredRows = rows.filter((valuation) => {
    const productName = productById.get(valuation.productId)?.name ?? valuation.productId;
    const matchesProduct = productFilter ? valuation.productId === productFilter : true;
    const matchesQuery = queryText
      ? [valuation.date, productName, valuation.note]
          .join(" ")
          .toLowerCase()
          .includes(queryText)
      : true;
    return matchesProduct && matchesQuery;
  });
  const limitNumber = limit === "all" ? filteredRows.length : Number(limit);
  const visibleRows = filteredRows.slice(0, limitNumber);
  const hasActiveFilter = Boolean(queryText || productFilter);
  const resetFilters = () => {
    setQuery("");
    setProductFilter("");
    setLimit("50");
  };
  const startEditing = (valuation: Valuation) => {
    setEditingKey(getValuationKey(valuation));
    setEditState({
      amount: String(valuation.amount),
      note: valuation.note,
    });
  };
  const cancelEditing = () => {
    setEditingKey(null);
    setEditState({ amount: "", note: "" });
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">入力履歴</h3>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-md bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
                全{valuations.length.toLocaleString("ja-JP")}件
              </span>
              <span className="rounded-md bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
                表示{visibleRows.length.toLocaleString("ja-JP")}件
              </span>
              <span className="rounded-md bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
                最新 {latestDate ?? "-"}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(180px,1fr)_minmax(160px,220px)_120px_auto] xl:w-[720px]">
            <label className="text-xs font-medium text-slate-600">
              検索
              <input
                className="mt-1 h-9 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-700"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="日付・商品・メモ"
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              商品
              <select
                className="mt-1 h-9 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-700"
                value={productFilter}
                onChange={(event) => setProductFilter(event.target.value)}
              >
                <option value="">すべて</option>
                {productOptions.map(([productId, productName]) => (
                  <option key={productId} value={productId}>
                    {productName}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600">
              件数
              <select
                className="mt-1 h-9 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-700"
                value={limit}
                onChange={(event) => setLimit(event.target.value as HistoryLimit)}
              >
                <option value="25">25件</option>
                <option value="50">50件</option>
                <option value="100">100件</option>
                <option value="all">全件</option>
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="button"
                className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 sm:w-auto"
                disabled={!hasActiveFilter && limit === "50"}
                onClick={resetFilters}
              >
                リセット
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="max-h-[520px] overflow-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 shadow-[inset_0_-1px_0_#e2e8f0]">
            <tr>
              <th className="whitespace-nowrap px-4 py-2 text-left font-medium text-slate-600">日付</th>
              <th className="min-w-52 px-4 py-2 text-left font-medium text-slate-600">商品</th>
              <th className="whitespace-nowrap px-4 py-2 text-right font-medium text-slate-600">評価額</th>
              <th className="min-w-56 px-4 py-2 text-left font-medium text-slate-600">メモ</th>
              <th className="whitespace-nowrap px-4 py-2 text-left font-medium text-slate-600">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleRows.map((valuation) => {
              const rowKey = getValuationKey(valuation);
              const isEditing = editingKey === rowKey;
              return (
                <tr key={rowKey} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-700">{valuation.date}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-700">
                    {productById.get(valuation.productId)?.name ?? valuation.productId}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold text-slate-800">
                    {isEditing ? (
                      <input
                        inputMode="decimal"
                        className="w-36 rounded-md border border-slate-300 px-3 py-2 text-right text-sm"
                        value={editState.amount}
                        onChange={(event) =>
                          setEditState((current) => ({
                            ...current,
                            amount: event.target.value,
                          }))
                        }
                      />
                    ) : (
                      formatCurrency(valuation.amount)
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {isEditing ? (
                      <input
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        value={editState.note}
                        onChange={(event) =>
                          setEditState((current) => ({
                            ...current,
                            note: event.target.value,
                          }))
                        }
                      />
                    ) : (
                      <span className="line-clamp-2">{valuation.note || "-"}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    {isEditing ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="rounded-md bg-slate-900 px-3 py-1 text-sm text-white transition hover:bg-slate-700 disabled:opacity-50"
                          disabled={isSaving}
                          onClick={async () => {
                            const isUpdated = await onUpdate(valuation, editState);
                            if (isUpdated) {
                              cancelEditing();
                            }
                          }}
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                          disabled={isSaving}
                          onClick={cancelEditing}
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                          disabled={isSaving}
                          onClick={() => startEditing(valuation)}
                        >
                          編集
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-red-200 px-3 py-1 text-sm text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                          disabled={isSaving}
                          onClick={() => void onDelete(valuation)}
                        >
                          削除
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  {valuations.length === 0 ? "入力履歴がありません。" : "条件に合う履歴がありません。"}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {filteredRows.length > visibleRows.length ? (
        <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-center text-xs font-medium text-slate-500">
          {filteredRows.length.toLocaleString("ja-JP")}件中
          {visibleRows.length.toLocaleString("ja-JP")}件を表示しています。件数を変更するとさらに表示できます。
        </div>
      ) : null}
    </div>
  );
}

function DataTable({ dataset, rows }: { dataset: AssetDataset; rows: AssetRow[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h3 className="text-lg font-semibold text-slate-900">日別評価額</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {dataset.headers.map((header, headerIndex) => (
                <th
                  key={`${header || "header"}-${headerIndex}`}
                  className="px-4 py-2 text-left font-medium text-slate-600"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((row) => (
              <tr key={row.index} className="hover:bg-slate-50">
                {dataset.headers.map((header, headerIndex) => (
                  <td
                    key={`${header || "cell"}-${headerIndex}`}
                    className="whitespace-nowrap px-4 py-2 text-slate-700"
                  >
                    {dataset.valueHeaders.includes(header) || header === TOTAL_HEADER
                      ? formatCurrency(row.numeric[header] ?? 0)
                      : row.raw[header] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={dataset.headers.length}
                  className="px-4 py-6 text-center text-slate-500"
                >
                  表示するデータがありません。
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function sendJson(
  path: string,
  method: "DELETE" | "POST" | "PUT",
  body: unknown,
  appPassword: string,
) {
  const response = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-app-password": appPassword.trim(),
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message ?? "保存に失敗しました。");
  }
  return payload;
}

function getValuationKey(valuation: Valuation): string {
  return `${valuation.date}-${valuation.productId}`;
}

function getToday(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("ja-JP", { style: "currency", currency: "JPY" });
}

function formatCompactCurrency(value: number): string {
  return value.toLocaleString("ja-JP", {
    style: "currency",
    currency: "JPY",
    notation: "compact",
    maximumFractionDigits: 1,
  });
}

function formatDateTime(date: Date): string {
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

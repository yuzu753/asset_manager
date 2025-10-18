"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type CsvDataset = {
  headers: string[];
  valueHeaders: string[];
  rows: CsvRow[];
};

type CsvRow = {
  index: number;
  label: string;
  raw: Record<string, string>;
  numeric: Record<string, number>;
};

type SortDirection = "asc" | "desc";

type SortConfig = {
  column: string;
  direction: SortDirection;
};

const DEFAULT_CATEGORY = "Uncategorized";

export function AssetDashboard() {
  const [dataset, setDataset] = useState<CsvDataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startLabel, setStartLabel] = useState<string | undefined>();
  const [endLabel, setEndLabel] = useState<string | undefined>();
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    column: "",
    direction: "desc",
  });
  const [categoryAssignments, setCategoryAssignments] = useState<
    Record<string, string>
  >({});
  const [chartView, setChartView] = useState<"category" | "asset">("category");
  const [timelineMetric, setTimelineMetric] = useState<string>("total");

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (!parsed) {
        throw new Error("CSVにデータが見つかりませんでした。");
      }

      setDataset(parsed);
      setError(null);
      setStartLabel(undefined);
      setEndLabel(undefined);
      setSortConfig({
        column: parsed.headers[0],
        direction: "desc",
      });
      const defaultAssignments = parsed.valueHeaders.reduce<Record<string, string>>(
        (acc, header) => {
          acc[header] = DEFAULT_CATEGORY;
          return acc;
        },
        {},
      );
      setCategoryAssignments(defaultAssignments);
      setTimelineMetric("total");
    } catch (err) {
      console.error(err);
      setDataset(null);
      setCategoryAssignments({});
      setError(err instanceof Error ? err.message : "CSVの読み込みに失敗しました。");
    } finally {
      event.target.value = "";
    }
  };

  const availableLabels = useMemo(() => dataset?.rows.map((row) => row.label) ?? [], [dataset]);

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
    const direction = sortConfig.direction;

    const rows = [...filteredRows];
    const isNumericColumn = dataset.valueHeaders.includes(column);

    rows.sort((a, b) => {
      if (isNumericColumn) {
        const diff = (a.numeric[column] ?? 0) - (b.numeric[column] ?? 0);
        return direction === "asc" ? diff : -diff;
      }
      if (column === dataset.headers[0]) {
        // Keep original order if labels are identical
        if (a.label === b.label) {
          return a.index - b.index;
        }
        return direction === "asc"
          ? a.label.localeCompare(b.label)
          : b.label.localeCompare(a.label);
      }

      const aValue = a.raw[column] ?? "";
      const bValue = b.raw[column] ?? "";

      return direction === "asc"
        ? aValue.localeCompare(bValue, "ja")
        : bValue.localeCompare(aValue, "ja");
    });

    return rows;
  }, [dataset, filteredRows, sortConfig]);

  const categories = useMemo(() => {
    const fromAssignments = new Set(Object.values(categoryAssignments));
    fromAssignments.add(DEFAULT_CATEGORY);
    return Array.from(fromAssignments);
  }, [categoryAssignments]);

  const categoryTotals = useMemo(() => {
    if (!dataset) {
      return {};
    }

    const totals: Record<string, number> = {};
    for (const header of dataset.valueHeaders) {
      const category = categoryAssignments[header] || DEFAULT_CATEGORY;
      const sum = sortedRows.reduce((acc, row) => acc + (row.numeric[header] ?? 0), 0);
      totals[category] = (totals[category] ?? 0) + sum;
    }
    return totals;
  }, [dataset, sortedRows, categoryAssignments]);

  const assetTotals = useMemo(() => {
    if (!dataset) {
      return {};
    }
    const totals: Record<string, number> = {};
    for (const header of dataset.valueHeaders) {
      totals[header] = sortedRows.reduce((acc, row) => acc + (row.numeric[header] ?? 0), 0);
    }
    return totals;
  }, [dataset, sortedRows]);

  const categoryTotalsList = useMemo(() => {
    return Object.entries(categoryTotals)
      .map(([label, value]) => ({
        label,
        value,
      }))
      .sort((a, b) => b.value - a.value);
  }, [categoryTotals]);

  const assetTotalsList = useMemo(() => {
    return Object.entries(assetTotals)
      .map(([label, value]) => ({
        label,
        value,
        category: categoryAssignments[label] ?? DEFAULT_CATEGORY,
      }))
      .sort((a, b) => b.value - a.value);
  }, [assetTotals, categoryAssignments]);

  const timelineData = useMemo(() => {
    if (!dataset) {
      return [];
    }

    return filteredRows.map((row) => {
      const label = row.label;
      const value =
        timelineMetric === "total"
          ? dataset.valueHeaders.reduce(
              (acc, header) => acc + (row.numeric[header] ?? 0),
              0,
            )
          : row.numeric[timelineMetric] ?? 0;
      return { label, value };
    });
  }, [dataset, filteredRows, timelineMetric]);

  const onChangeCategory = (asset: string, category: string) => {
    setCategoryAssignments((assignments) => ({
      ...assignments,
      [asset]: category.trim() || DEFAULT_CATEGORY,
    }));
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">
          CSVから金融資産を読み込む
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          1行が1か月分、列が資産となるCSVファイルをアップロードしてください。
          先頭行はヘッダー行として扱われます。
        </p>
        <label className="mt-6 flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center transition hover:border-slate-400 hover:bg-slate-100">
          <span className="text-sm font-medium text-slate-700">
            CSVファイルを選択
          </span>
          <span className="mt-1 text-xs text-slate-500">
            拡張子が .csv のファイルをアップロードしてください
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>
        {error ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </section>

      {dataset ? (
        <section className="space-y-8">
          <FiltersPanel
            labels={availableLabels}
            sortConfig={sortConfig}
            setStartLabel={setStartLabel}
            setEndLabel={setEndLabel}
            onChangeSort={setSortConfig}
            dataset={dataset}
          />

          <CategoryManager
            dataset={dataset}
            categories={categories}
            categoryAssignments={categoryAssignments}
            onChangeCategory={onChangeCategory}
          />

          <SummaryPanels
            categoryTotals={categoryTotalsList}
            assetTotals={assetTotalsList}
          />

          <ChartSection
            view={chartView}
            onChangeView={setChartView}
            categoryData={categoryTotalsList}
            assetData={assetTotalsList}
          />

          <TimelineChart
            metric={timelineMetric}
            onMetricChange={setTimelineMetric}
            metricOptions={dataset.valueHeaders}
            data={timelineData}
          />

          <DataTable dataset={dataset} rows={sortedRows} />
        </section>
      ) : null}
    </div>
  );
}

type FiltersPanelProps = {
  labels: string[];
  dataset: CsvDataset;
  sortConfig: SortConfig;
  setStartLabel: (value: string | undefined) => void;
  setEndLabel: (value: string | undefined) => void;
  onChangeSort: (config: SortConfig) => void;
};

function FiltersPanel({
  labels,
  dataset,
  sortConfig,
  setStartLabel,
  setEndLabel,
  onChangeSort,
}: FiltersPanelProps) {
  const handleSortColumnChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const column = event.target.value;
    onChangeSort({
      column,
      direction: sortConfig.direction,
    });
  };

  const handleDirectionToggle = () => {
    onChangeSort({
      column: sortConfig.column,
      direction: sortConfig.direction === "asc" ? "desc" : "asc",
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">期間と並び替え</h2>
      <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end">
        <div className="flex-1">
          <label className="block text-sm font-medium text-slate-700">
            開始
          </label>
          <select
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) =>
              setStartLabel(event.target.value || undefined)
            }
            defaultValue=""
          >
            <option value="">最初の行</option>
            {labels.map((label, index) => (
              <option key={`start-label-${index}`} value={label}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-slate-700">
            終了
          </label>
          <select
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) => setEndLabel(event.target.value || undefined)}
            defaultValue=""
          >
            <option value="">最後の行</option>
            {labels.map((label, index) => (
              <option key={`end-label-${index}`} value={label}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-slate-700">
            並び替え
          </label>
          <select
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={sortConfig.column}
            onChange={handleSortColumnChange}
          >
            {dataset.headers.map((header, index) => (
              <option key={`${header || "header"}-${index}`} value={header}>
                {header}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="h-10 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          onClick={handleDirectionToggle}
        >
          {sortConfig.direction === "asc" ? "昇順" : "降順"}
        </button>
      </div>
    </div>
  );
}

type CategoryManagerProps = {
  dataset: CsvDataset;
  categories: string[];
  categoryAssignments: Record<string, string>;
  onChangeCategory: (asset: string, category: string) => void;
};

function CategoryManager({
  dataset,
  categories,
  categoryAssignments,
  onChangeCategory,
}: CategoryManagerProps) {
  const categoryListId = "category-options";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">カテゴリ設定</h2>
      <p className="mt-2 text-sm text-slate-600">
        資産ごとにカテゴリを指定すると、カテゴリ別合計が計算されます。
      </p>
      <datalist id={categoryListId}>
        {categories.map((category, index) => (
          <option key={`${category || "category"}-${index}`} value={category} />
        ))}
      </datalist>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {dataset.valueHeaders.map((header, index) => (
          <label
            key={`${header || "asset"}-${index}`}
            className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4"
          >
            <span className="text-sm font-medium text-slate-700">{header}</span>
            <input
              list={categoryListId}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={categoryAssignments[header] ?? DEFAULT_CATEGORY}
              onChange={(event) => onChangeCategory(header, event.target.value)}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

type TotalsEntry = {
  label: string;
  value: number;
};

type AssetTotalsEntry = TotalsEntry & {
  category: string;
};

type SummaryPanelsProps = {
  categoryTotals: TotalsEntry[];
  assetTotals: AssetTotalsEntry[];
};

function SummaryPanels({
  categoryTotals,
  assetTotals,
}: SummaryPanelsProps) {
  const formatCurrency = (value: number) =>
    value.toLocaleString("ja-JP", { style: "currency", currency: "JPY" });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">カテゴリ別合計</h3>
        <ul className="mt-3 space-y-2 text-sm text-slate-700">
          {categoryTotals.map(({ label, value }, index) => (
            <li
              key={`summary-category-${label}-${index}`}
              className="flex items-center justify-between"
            >
              <span>{label}</span>
              <span className="font-semibold">{formatCurrency(value)}</span>
            </li>
          ))}
          {categoryTotals.length === 0 ? (
            <li className="text-slate-500">データがありません。</li>
          ) : null}
        </ul>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">資産別合計</h3>
        <ul className="mt-3 space-y-2 text-sm text-slate-700">
          {assetTotals.map(({ label, value, category }, index) => (
            <li
              key={`summary-asset-${label}-${index}`}
              className="flex items-center justify-between"
            >
              <span>
                {label}
                <span className="ml-2 text-xs text-slate-500">
                  ({category})
                </span>
              </span>
              <span className="font-semibold">{formatCurrency(value)}</span>
            </li>
          ))}
          {assetTotals.length === 0 ? (
            <li className="text-slate-500">データがありません。</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}

type ChartSectionProps = {
  view: "category" | "asset";
  onChangeView: (view: "category" | "asset") => void;
  categoryData: TotalsEntry[];
  assetData: AssetTotalsEntry[];
};

function ChartSection({
  view,
  onChangeView,
  categoryData,
  assetData,
}: ChartSectionProps) {
  const chartItems: Array<{ label: string; value: number; category?: string }> =
    view === "category"
      ? categoryData.map((item) => ({ ...item }))
      : assetData.map((item) => ({ ...item }));
  const maxValue = chartItems.reduce((acc, item) => Math.max(acc, item.value), 0);
  const formatCurrency = (value: number) =>
    value.toLocaleString("ja-JP", { style: "currency", currency: "JPY" });

  const title = view === "category" ? "カテゴリ別チャート" : "資産別チャート";
  const description =
    view === "category"
      ? "カテゴリ合計の比較を横棒グラフで表示します。"
      : "資産ごとの合計と所属カテゴリを表示します。";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <p className="text-sm text-slate-600">{description}</p>
        </div>
        <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
          <button
            type="button"
            onClick={() => onChangeView("category")}
            className={`px-3 py-2 text-sm font-medium transition ${
              view === "category"
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            カテゴリ別
          </button>
          <button
            type="button"
            onClick={() => onChangeView("asset")}
            className={`px-3 py-2 text-sm font-medium transition ${
              view === "asset"
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            資産別
          </button>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {chartItems.length === 0 ? (
          <p className="text-sm text-slate-500">データがありません。</p>
        ) : (
          chartItems.map((item, index) => {
            const ratio =
              maxValue === 0
                ? 0
                : Math.max(0, Math.min(100, (item.value / maxValue) * 100));
            return (
              <div
                key={`chart-${view}-${item.label}-${index}`}
                className="space-y-1"
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{item.label}</span>
                  {item.category ? (
                    <span className="text-xs text-slate-500">{item.category}</span>
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
          })
        )}
      </div>
    </div>
  );
}

type TimelineChartProps = {
  metric: string;
  onMetricChange: (value: string) => void;
  metricOptions: string[];
  data: TotalsEntry[];
};

function TimelineChart({
  metric,
  onMetricChange,
  metricOptions,
  data,
}: TimelineChartProps) {
  const maxValue = data.reduce((acc, item) => Math.max(acc, item.value), 0);
  const formatCurrency = (value: number) =>
    value.toLocaleString("ja-JP", { style: "currency", currency: "JPY" });
  const currentLabel = metric === "total" ? "全資産合計" : metric;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">期間推移チャート</h3>
          <p className="text-sm text-slate-600">
            フィルタ後の期間について、選択した指標の推移を折れ線グラフで表示します。
          </p>
        </div>
        <label className="flex flex-col text-sm font-medium text-slate-700 md:flex-row md:items-center md:gap-3">
          <span>指標</span>
          <select
            className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm md:mt-0"
            value={metric}
            onChange={(event) => onMetricChange(event.target.value)}
          >
            <option value="total">全資産合計</option>
            {metricOptions.map((option, index) => (
              <option
                key={`timeline-option-${option}-${index}`}
                value={option}
              >
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5 space-y-4">
        {data.length === 0 ? (
          <p className="text-sm text-slate-500">
            データがありません。CSVをアップロードして期間を指定してください。
          </p>
        ) : (
          <>
            <p className="text-xs text-slate-500">
              表示中の指標:{" "}
              <span className="font-semibold text-slate-600">{currentLabel}</span>
            </p>
            <TimelineLineChart
              data={data}
              maxValue={maxValue}
              yFormatter={formatCurrency}
            />
          </>
        )}
      </div>
    </div>
  );
}

type TimelineLineChartProps = {
  data: TotalsEntry[];
  maxValue: number;
  yFormatter: (value: number) => string;
};

function TimelineLineChart({
  data,
  maxValue,
  yFormatter,
}: TimelineLineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>(680);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const updateWidth = () => {
      const element = containerRef.current;
      if (!element) {
        return;
      }
      const newWidth = element.clientWidth;
      if (newWidth > 0) {
        setWidth((prev) => (Math.abs(prev - newWidth) > 1 ? newWidth : prev));
      }
    };

    updateWidth();

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => updateWidth());
      if (containerRef.current) {
        observer.observe(containerRef.current);
      }
    } else {
      window.addEventListener("resize", updateWidth);
    }

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, []);

  const effectiveWidth = Math.max(width, 320);
  const height = 260;
  const padding = { top: 20, right: 24, bottom: 48, left: 64 };
  const innerWidth = Math.max(effectiveWidth - padding.left - padding.right, 1);
  const innerHeight = Math.max(height - padding.top - padding.bottom, 1);
  const maxY = maxValue === 0 ? 1 : maxValue;

  const labelStep = data.length > 12 ? Math.ceil(data.length / 12) : 1;
  const showValueLabel = data.length <= 20;

  const points = data.map((item, index) => {
    const x =
      data.length === 1
        ? innerWidth / 2
        : (innerWidth / Math.max(1, data.length - 1)) * index;
    const y = innerHeight - (item.value / maxY) * innerHeight;
    return { item, x, y };
  });

  const linePath = points
    .map(({ x, y }, index) => `${index === 0 ? "M" : "L"} ${x} ${y}`)
    .join(" ");
  const areaPath =
    points.length > 0
      ? `${linePath} L ${innerWidth} ${innerHeight} L 0 ${innerHeight} Z`
      : "";

  const yTicks = 5;
  const yValues = Array.from({ length: yTicks + 1 }, (_, index) => (maxY / yTicks) * index);

  return (
    <div ref={containerRef} className="overflow-hidden">
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${effectiveWidth} ${height}`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="timeline-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>

        <g transform={`translate(${padding.left},${padding.top})`}>
          <line
            x1={0}
            x2={innerWidth}
            y1={innerHeight}
            y2={innerHeight}
            stroke="#cbd5f5"
            strokeWidth={1}
          />

          {yValues.map((value, index) => {
            const y =
              innerHeight - (value / maxY) * innerHeight;
            return (
              <g key={`grid-${index}`}>
                <line x1={0} x2={innerWidth} y1={y} y2={y} stroke="#e2e8f0" strokeWidth={1} />
                <text
                  x={-12}
                  y={y + 4}
                  textAnchor="end"
                  fontSize={10}
                  fill="#64748b"
                >
                  {yFormatter(value)}
                </text>
              </g>
            );
          })}

          {points.length > 0 ? (
            <>
              {areaPath ? (
                <path
                  d={areaPath}
                  fill="url(#timeline-fill)"
                  stroke="none"
                />
              ) : null}
              <path
                d={linePath}
                fill="none"
                stroke="#10b981"
                strokeWidth={3}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {points.map(({ item, x, y }, index) => (
                <g key={`point-${item.label}-${index}`}>
                  <circle
                    cx={x}
                    cy={y}
                    r={4.5}
                    fill="#10b981"
                    stroke="white"
                    strokeWidth={2}
                  />
                  {showValueLabel ? (
                    <text
                      x={x}
                      y={Math.max(y - 12, 0)}
                      textAnchor="middle"
                      fontSize={10}
                      fontWeight="bold"
                      fill="#059669"
                    >
                      {yFormatter(item.value)}
                    </text>
                  ) : null}
                  {(index % labelStep === 0 || index === points.length - 1) ? (
                    <text
                      transform={`translate(${x}, ${innerHeight + 24}) rotate(-45)`}
                      textAnchor="end"
                      fontSize={10}
                      fill="#334155"
                    >
                      {item.label}
                    </text>
                  ) : null}
                </g>
              ))}
            </>
          ) : null}
        </g>
      </svg>
    </div>
  );
}

type DataTableProps = {
  dataset: CsvDataset;
  rows: CsvRow[];
};

function DataTable({ dataset, rows }: DataTableProps) {
  const formatCurrency = (value: number) =>
    value.toLocaleString("ja-JP", { style: "currency", currency: "JPY" });

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {dataset.headers.map((header, headerIndex) => (
                <th
                  key={`${header || "header"}-${headerIndex}`}
                  className="px-4 py-2 text-left font-medium uppercase tracking-wide text-slate-600"
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
                    {dataset.valueHeaders.includes(header)
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

function parseCsv(text: string): CsvDataset | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return null;
  }

  const headers = splitCsvLine(lines[0]);
  if (headers.length < 2) {
    throw new Error("ヘッダー行を確認してください。少なくとも2列が必要です。");
  }

  const valueHeaders = headers.slice(1);
  const rows: CsvRow[] = [];

  for (let index = 1; index < lines.length; index += 1) {
    const cells = splitCsvLine(lines[index]);
    if (cells.length === 0) {
      continue;
    }
    const row: CsvRow = {
      index,
      label: cells[0] ?? `Row ${index}`,
      raw: {},
      numeric: {},
    };
    headers.forEach((header, headerIndex) => {
      row.raw[header] = cells[headerIndex] ?? "";
      if (headerIndex > 0) {
        row.numeric[header] = normaliseNumber(cells[headerIndex] ?? "");
      }
    });
    rows.push(row);
  }

  return {
    headers,
    valueHeaders,
    rows,
  };
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

function normaliseNumber(value: string): number {
  const sanitised = value.replace(/[^0-9+\-.,]/g, "").replace(/,/g, "");
  const parsed = Number(sanitised);
  return Number.isFinite(parsed) ? parsed : 0;
}

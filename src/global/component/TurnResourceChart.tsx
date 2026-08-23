/**
 * @module TurnResourceChart
 * @description ターンごとの資源・食料需給・雇用統計を表示するコンポーネント。
 */
import { TurnResourceHistory } from '@/db/kysely';
import { calculateEmploymentStats, type EmploymentStats } from '@/global/function/employment';

type HistoryRow = Omit<TurnResourceHistory, 'uuid'>;

type Props = {
  className?: string;
  data?: HistoryRow[];
};

type MetricConfig = {
  id: string;
  label: string;
  stroke: string;
  getValue: (row: HistoryRow) => number | null;
  formatValue: (value: number) => string;
  formatDiff: (value: number) => string;
};

function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('ja-JP').format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatRatio(value: number) {
  return `${value.toFixed(2)}倍`;
}

function foodSupplyRate(row: HistoryRow): number | null {
  if (isNullish(row.food_production) || isNullish(row.food_consumption)) return null;
  if (row.food_consumption <= 0) return null;
  return (row.food_production / row.food_consumption) * 100;
}

function foodDepletionTurns(row: HistoryRow): string | null {
  if (isNullish(row.food_production) || isNullish(row.food_consumption)) return null;

  const balance = row.food_production - row.food_consumption;
  if (balance >= 0) return 'Inf';

  return `${Math.ceil(Math.max(0, row.food) / -balance)}T`;
}

function calculateEmployment(row: HistoryRow): EmploymentStats | null {
  if (isNullish(row.farm) || isNullish(row.labor_factory) || isNullish(row.labor_mining))
    return null;

  return calculateEmploymentStats({
    population: row.population,
    farmCapacity: row.farm,
    factoryCapacity: row.labor_factory,
    miningCapacity: row.labor_mining,
  });
}

function jobOpeningRatio(row: HistoryRow): number | null {
  return calculateEmployment(row)?.jobOpeningRatio ?? null;
}

const METRICS: MetricConfig[] = [
  {
    id: 'population',
    label: '人口',
    stroke: '#1d4ed8',
    getValue: (row) => row.population,
    formatValue: formatNumber,
    formatDiff: (value) => formatNumber(value),
  },
  {
    id: 'money',
    label: '資金',
    stroke: '#dc2626',
    getValue: (row) => row.money,
    formatValue: formatNumber,
    formatDiff: (value) => formatNumber(value),
  },
  {
    id: 'food',
    label: '食料',
    stroke: '#16a34a',
    getValue: (row) => row.food,
    formatValue: formatNumber,
    formatDiff: (value) => formatNumber(value),
  },
  {
    id: 'food-supply',
    label: '食料需給率',
    stroke: '#0891b2',
    getValue: foodSupplyRate,
    formatValue: formatPercent,
    formatDiff: (value) => `${value.toFixed(1)}pt`,
  },
  {
    id: 'job-opening-ratio',
    label: '求人倍率',
    stroke: '#7c3aed',
    getValue: jobOpeningRatio,
    formatValue: formatRatio,
    formatDiff: (value) => value.toFixed(2),
  },
];

function escapeCsvValue(value: string | number | null): string {
  if (isNullish(value)) return '';
  const raw = String(value);
  if (/[",\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function toCsv(data: HistoryRow[]): string {
  const header = [
    'turn',
    'population',
    'food',
    'money',
    'farm',
    'advanced_factory',
    'unmanned_mining',
    'labor_factory',
    'labor_mining',
    'food_production',
    'food_consumption',
    'food_supply_rate_percent',
    'food_depletion_turns',
    'farm_workers',
    'factory_workers',
    'mining_workers',
    'unemployed',
    'unused_capacity',
    'job_opening_ratio',
  ];

  const lines = data.map((row) => {
    const employment = calculateEmployment(row);
    return [
      row.turn,
      row.population,
      row.food,
      row.money,
      row.farm,
      row.factory,
      row.mining,
      row.labor_factory,
      row.labor_mining,
      row.food_production,
      row.food_consumption,
      foodSupplyRate(row),
      foodDepletionTurns(row),
      employment?.farmWorkers ?? null,
      employment?.factoryWorkers ?? null,
      employment?.miningWorkers ?? null,
      employment?.unemployed ?? null,
      employment?.unusedCapacity ?? null,
      employment?.jobOpeningRatio ?? null,
    ];
  });

  return [header, ...lines]
    .map((line) => line.map((value) => escapeCsvValue(value)).join(','))
    .join('\n');
}

function downloadCsv(data: HistoryRow[]) {
  const csv = toCsv(data);
  const bom = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate()
  ).padStart(
    2,
    '0'
  )}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;

  link.href = url;
  link.download = `turn-resource-history-${ts}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildPolyline(values: Array<number | null>): {
  points: string;
  minValue: number;
  maxValue: number;
} | null {
  const valid = values
    .map((value, index) => ({ value, index }))
    .filter((item): item is { value: number; index: number } => !isNullish(item.value));

  if (valid.length === 0) return null;

  const numericValues = valid.map((item) => item.value);
  const maxValue = Math.max(...numericValues);
  const minValue = Math.min(...numericValues);
  const diff = Math.max(1e-9, maxValue - minValue);
  const xDivisor = Math.max(1, values.length - 1);

  const points = valid
    .map(({ value, index }) => {
      const x = (index / xDivisor) * 100;
      const y = maxValue === minValue ? 50 : 100 - ((value - minValue) / diff) * 100;
      return `${x},${y}`;
    })
    .join(' ');

  return { points, minValue, maxValue };
}

function findLatestMetricIndex(values: Array<number | null>): number {
  for (let i = values.length - 1; i >= 0; i--) {
    if (!isNullish(values[i])) return i;
  }
  return -1;
}

function MetricCard({ metric, data }: { metric: MetricConfig; data: HistoryRow[] }) {
  const values = data.map(metric.getValue);
  const chart = buildPolyline(values);
  if (!chart) return null;

  const latestIndex = findLatestMetricIndex(values);
  if (latestIndex < 0) return null;

  const latestValue = values[latestIndex];
  if (isNullish(latestValue)) return null;

  let previousValue: number | null = null;
  for (let i = latestIndex - 1; i >= 0; i--) {
    if (!isNullish(values[i])) {
      previousValue = values[i];
      break;
    }
  }

  const diff = isNullish(previousValue) ? 0 : latestValue - previousValue;
  const diffSign = diff >= 0 ? '+' : '';
  const diffPositive = diff >= 0;
  const depletion = metric.id === 'food-supply' ? foodDepletionTurns(data[latestIndex]) : null;

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white/80 shadow-sm">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
          {metric.label}
        </span>
        <div className="flex flex-wrap items-baseline justify-end gap-2">
          <span className="font-mono text-base font-bold text-gray-800">
            {metric.formatValue(latestValue)}
          </span>
          <span
            className={`rounded px-1 py-0.5 font-mono text-xs font-semibold ${
              diffPositive ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-500'
            }`}
          >
            {`${diffSign}${metric.formatDiff(diff)}`}
          </span>
          {depletion && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-semibold text-gray-600">
              {`枯渇まで ${depletion}`}
            </span>
          )}
        </div>
      </div>

      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-16 w-full">
        <polyline
          fill="none"
          stroke={metric.stroke}
          strokeWidth="2.5"
          points={chart.points}
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="flex justify-between border-t border-gray-100 px-3 py-1.5 text-xs text-gray-400">
        <span>{`最小 ${metric.formatValue(chart.minValue)}`}</span>
        <span>{`最大 ${metric.formatValue(chart.maxValue)}`}</span>
      </div>
    </div>
  );
}

function EmploymentChart({ data }: { data: HistoryRow[] }) {
  let latest: HistoryRow | undefined;
  for (let i = data.length - 1; i >= 0; i--) {
    if (
      !isNullish(data[i].farm) &&
      !isNullish(data[i].labor_factory) &&
      !isNullish(data[i].labor_mining)
    ) {
      latest = data[i];
      break;
    }
  }

  if (!latest) return null;

  const stats = calculateEmployment(latest);
  if (!stats) return null;

  const population = Math.max(0, latest.population);
  const industries = [
    {
      label: '農業',
      capacity: Math.max(0, latest.farm ?? 0),
      workers: stats.farmWorkers,
    },
    {
      label: '工場',
      capacity: Math.max(0, latest.labor_factory ?? 0),
      workers: stats.factoryWorkers,
    },
    {
      label: '採掘',
      capacity: Math.max(0, latest.labor_mining ?? 0),
      workers: stats.miningWorkers,
    },
  ];
  const maxCapacity = Math.max(1, ...industries.map((industry) => industry.capacity));

  return (
    <div className="mx-2 mb-2 overflow-hidden rounded-lg border border-gray-200 bg-white/80 shadow-sm">
      <div className="border-b border-gray-100 px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
            雇用統計
          </span>
          <span className="text-xs text-gray-500">{`ターン ${latest.turn}`}</span>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-5">
          <div>
            人口 <b>{formatNumber(population)}人</b>
          </div>
          <div>
            就業 <b>{formatNumber(stats.employed)}人</b>
          </div>
          <div>
            失業 <b>{formatNumber(stats.unemployed)}人</b>
          </div>
          <div>
            無効設備 <b>{formatNumber(stats.unusedCapacity)}人分</b>
          </div>
          <div>
            求人倍率{' '}
            <b>{isNullish(stats.jobOpeningRatio) ? '—' : formatRatio(stats.jobOpeningRatio)}</b>
          </div>
        </div>
      </div>

      <div className="px-4 pt-3">
        <div className="flex justify-end gap-3 text-[11px] text-gray-500">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500" />
            就業
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-400" />
            設備余力
          </span>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-4">
          {industries.map((industry) => {
            const unused = Math.max(0, industry.capacity - industry.workers);
            const employedPercent =
              industry.capacity > 0 ? (industry.workers / industry.capacity) * 100 : 0;
            const unusedPercent = industry.capacity > 0 ? 100 - employedPercent : 0;
            const populationShare = population > 0 ? (industry.workers / population) * 100 : 0;
            const barHeight = (industry.capacity / maxCapacity) * 100;

            return (
              <div key={industry.label} className="min-w-0 text-center">
                <div className="flex h-32 items-end justify-center">
                  <div
                    className="flex w-full max-w-20 flex-col justify-end overflow-hidden rounded-t border border-gray-200"
                    style={{ height: `${barHeight}%` }}
                    aria-label={`${industry.label} 設備${industry.capacity}人分 就業${industry.workers}人`}
                  >
                    {unused > 0 && (
                      <div className="bg-amber-400" style={{ height: `${unusedPercent}%` }} />
                    )}
                    {industry.workers > 0 && (
                      <div className="bg-red-500" style={{ height: `${employedPercent}%` }} />
                    )}
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-1 text-sm font-bold text-gray-700">
                  {industry.label}
                </div>
                <div className="mt-0.5 text-[11px] text-gray-500">
                  {`設備 ${formatNumber(industry.capacity)}人`}
                </div>
                <div className="text-[11px] text-gray-700">
                  {`就業 ${formatNumber(industry.workers)}人`}
                </div>
                <div className="font-mono text-[11px] font-semibold text-gray-700">
                  {`人口比 ${populationShare.toFixed(1)}%`}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="px-3 py-2 text-[11px] text-gray-500">
        農業を優先して就業させ、残人口を工場・採掘場の設備規模比で按分。求人倍率は有人設備の総雇用枠÷人口。先進工場・無人化採掘場は雇用統計に含みません。
      </p>
    </div>
  );
}

export default function TurnResourceChart({ className, data }: Props) {
  if (!data || data.length === 0) return null;

  const latest = data[data.length - 1];
  const first = data[0];

  return (
    <div className={className}>
      <div className="flex justify-end px-2 pb-1">
        <button
          type="button"
          onClick={() => downloadCsv(data)}
          className="cursor-pointer rounded border border-gray-300 bg-white px-2 py-1 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-100"
        >
          CSV出力
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2 p-2">
        {METRICS.map((metric) => (
          <MetricCard key={metric.id} metric={metric} data={data} />
        ))}
      </div>

      <EmploymentChart data={data} />

      <p className="px-2 pb-2 text-xs text-gray-600">
        {`表示範囲: ターン${first.turn}〜${latest.turn}（最新100ターン）`}
      </p>
    </div>
  );
}

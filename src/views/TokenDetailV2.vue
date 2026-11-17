<template>
  <div class="token-detail-v2">
    <button class="back-btn" @click="$router.back()">← 返回总览</button>

    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <template v-else>
      <!-- Header -->
      <div class="detail-header">
        <h2>{{ strategy }} / {{ symbol }}</h2>
        <p>
          日期范围: {{ dateRange?.[0] }} ~ {{ dateRange?.[1] }}
          <span v-if="dirName" class="muted"> | 策略目录: {{ dirName }}</span>
        </p>
        <el-tag v-if="modeLabel" :type="modeTagType">{{ modeLabel }}</el-tag>
      </div>

      <!-- Strategy Logic Inline -->
      <div class="strategy-logic-inline">
        <div class="logic-toggle" @click="logicExpanded = !logicExpanded">
          <span class="logic-label">策略逻辑:</span>
          <button class="btn-toggle-inline">{{ logicExpanded ? '[收起 ▲]' : '[展开 ▼]' }}</button>
        </div>
        <div v-show="logicExpanded" class="logic-content-inline">
          <div class="logic-section-inline">
            <div class="logic-title-inline">【开仓】</div>
            <ul>
              <li v-for="(rule, idx) in strategyLogic.entry_conditions.rules" :key="idx">{{ rule }}</li>
            </ul>
          </div>
          <div class="logic-section-inline">
            <div class="logic-title-inline">【风控】</div>
            <ul>
              <li v-for="(rule, idx) in strategyLogic.risk_management.rules" :key="idx">{{ rule }}</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- 日期范围选择（默认单日，可选多日） -->
      <div class="date-range-bar">
        <span class="bar-label">日期范围:</span>
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          :clearable="false"
          @change="onDateRangeChange"
        />
        <button class="reload-btn" @click="fetchData">重新加载</button>
      </div>

      <!-- 图表控制 -->
      <div class="chart-controls">
        <div class="backplay-toggle">
          <label class="checkbox-label">
            <input type="checkbox" v-model="showLiveSignals" :disabled="!dirName" />
            <span>实盘信号 ({{ liveSignals.length }})</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="showBacktestSignals" :disabled="!dirName" />
            <span>回放信号 ({{ backtestSignals.length }})</span>
          </label>
          <span v-if="signalsLoading" class="backplay-status">加载中...</span>
        </div>
        <IndicatorPanel v-model="selectedIndicators" :strategy="strategyPrefix" />
      </div>

      <TimeframeSelector v-model="selectedTimeframe" v-model:display-count="displayCount" />
      <div v-if="dataWarning" class="data-warning">⚠️ {{ dataWarning }}</div>
      <div v-if="warmupWarning" class="data-warning">⚠️ {{ warmupWarning }}</div>
      <div v-if="emptyData" class="data-warning">⚠️ 所选范围内无K线数据，请调整日期范围</div>

      <!-- 复用 v1 TechnicalChart（已是解耦渲染组件，仅消费 KlinePoint[]） -->
      <TechnicalChart
        :kline-data="chartKlineData"
        :warmup-count="warmupCount"
        :strategy="strategy"
        :symbol="symbol"
        :indicators="selectedIndicators"
        :display-count="effectiveDisplayCount"
        :signals="chartSignals"
        @entry-click="handleEntryClick"
        @exit-click="handleExitClick"
        @bar-click="handleBarClick"
      />

      <!-- 仓位详情弹框 -->
      <el-dialog v-model="entryDialogVisible" :title="entryDialogTitle" width="90%" top="5vh">
        <PriceRoiChart
          v-if="entryDialogVisible"
          :timeline-data="processedKlineData"
          :highlight-position-id="highlightPositionId"
        />
      </el-dialog>

      <!-- 实盘与回放信号对比 -->
      <ComparisonReport :comparison="comparisonData" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { dataRepository } from '@/data'
import { getLatestCatalogDay } from '@/services/catalog'
import { klineService } from '@/services/kline'
import { loadLivePositions, toChartPosition } from '@/services/livePerformance'
import { mergePositionsByTime } from '@/utils/klineV2'
import { getDefaultDisplayCount, timeframeMinutes } from '@/utils/resample'
import { enumerateDates } from '@/utils/klineRange'
import type { RawKlinePoint } from '@/models/klineV2'
import type { KlinePoint, TimeframeValue } from '@/models/kline'
import type { DatedPosition } from '@/utils/klineV2'
import { warmupBarsFor, type IndicatorType } from '@/indicators'
import type { ChartSignalPoint, Signal, SignalComparison } from '@/models/detail'
import type { SignalComparisonRow, SignalRow, StrategyMetaV2 } from '@/models/dataset'
import TechnicalChart from '@/components/detail/TechnicalChart.vue'
import IndicatorPanel from '@/components/detail/IndicatorPanel.vue'
import TimeframeSelector from '@/components/detail/TimeframeSelector.vue'
import PriceRoiChart from '@/components/detail/PriceRoiChart.vue'
import ComparisonReport from '@/components/detail/ComparisonReport.vue'
import type { StrategyLogic as StrategyLogicType } from '@/models/detail'
import { getStrategyMeta, setStrategyMeta, strategyMeta, type StrategyMeta } from '@/api/strategyMeta'

const props = defineProps<{ strategy: string; symbol: string }>()
const route = useRoute()

/** frontend_data 下的策略目录名；缺失时回退为路由参数 */
const dirName = computed(() => (route.query.dir as string) || props.strategy)

const tradingMode = ref<'' | 'live' | 'paper_trading' | 'smoking'>('')

const modeLabel = computed(() => {
  const map: Record<string, string> = {
    live: 'Product',
    paper_trading: 'Paper',
    smoking: 'Smoking',
  }
  return map[tradingMode.value] ?? ''
})

const modeTagType = computed(() => {
  const map: Record<string, string> = {
    live: 'danger',
    paper_trading: 'warning',
    smoking: 'info',
  }
  return (map[tradingMode.value] ?? 'info') as 'danger' | 'warning' | 'info'
})

const loading = ref(true)
const error = ref<string | null>(null)
const rawKline = ref<RawKlinePoint[]>([])
const datedPositions = ref<DatedPosition[]>([])
const selectedIndicators = ref<IndicatorType[]>(['RSI', 'MACD', 'ATR'])

/** 指标预热段（业务区间之前的历史 bar，只参与指标计算不参与显示） */
const warmupKline = ref<RawKlinePoint[]>([])
/** 预热段最后一根的日期，用于检测与业务区间之间的缺口 */
const warmupLastDate = ref<string | null>(null)
/** 预热段是否没取够（数据过期或 1m 回退封顶） */
const warmupTruncated = ref(false)
/** 本次实际需要的预热根数，用于告警文案 */
const warmupNeeded = ref(0)

const VALID_TFS: TimeframeValue[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1d']
const tfQuery = (route.query.tf as string) ?? ''
const initialTf: TimeframeValue = (VALID_TFS as string[]).includes(tfQuery)
  ? (tfQuery as TimeframeValue)
  : '5m'
const selectedTimeframe = ref<TimeframeValue>(initialTf)
const displayCount = ref(100)

const showLiveSignals = ref(true)
const showBacktestSignals = ref(false)
const signalsLoading = ref(false)
const liveSignals = ref<ChartSignalPoint[]>([])
const backtestSignals = ref<ChartSignalPoint[]>([])

const entryDialogVisible = ref(false)
const entryDialogTitle = ref('')
const highlightPositionId = ref('')
const comparisonData = ref<SignalComparison | undefined>(undefined)
const logicExpanded = ref(false)

// 策略元数据与逻辑（由数据源提供，见 api/strategyMeta.ts）
// 依赖 strategyMeta.value 使其在异步加载完成后自动重算。
const strategyConfig = computed<StrategyMeta | null>(() => {
  void strategyMeta.value
  return getStrategyMeta(props.strategy)
})
const strategyPrefix = computed(() => dirName.value)
const strategyLogic = computed<StrategyLogicType>(() => {
  const logic = strategyConfig.value?.logic
  if (logic) {
    return {
      entry_conditions: { title: '入场条件', rules: logic.entry ?? [] },
      exit_conditions: { title: '出场条件', rules: logic.exit ?? [] },
      risk_management: { title: '风控规则', rules: logic.risk ?? [] },
    }
  }
  return {
    entry_conditions: { title: '入场条件', rules: ['策略逻辑未配置，请查看策略代码'] },
    exit_conditions: { title: '出场条件', rules: ['策略逻辑未配置，请查看策略代码'] },
    risk_management: { title: '风控规则', rules: ['策略逻辑未配置，请查看策略代码'] },
  }
})

// ---- 日期范围（ISO YYYY-MM-DD）----
function yyyymmddToIso(s: string): string {
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}
function isoToYyyymmdd(s: string): string {
  return s.replace(/-/g, '')
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}
function initialDateRange(): [string, string] {
  // 优先使用 from/to（ISO YYYY-MM-DD，区间统计等入口透传）
  const qFrom = (route.query.from as string) ?? ''
  const qTo = (route.query.to as string) ?? ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(qFrom) && /^\d{4}-\d{2}-\d{2}$/.test(qTo)) {
    return [qFrom, qTo]
  }
  const q = (route.query.date as string) ?? ''
  if (/^\d{8}$/.test(q)) {
    const iso = yyyymmddToIso(q)
    return [iso, iso]
  }
  const t = todayIso()
  return [t, t]
}
const dateRange = ref<[string, string] | null>(initialDateRange())

// ---- 仓位 overlay：业务段已是对应周期 bar，按时间区间定位开平仓 ----
const processedKlineData = computed<KlinePoint[]>(() => {
  if (rawKline.value.length === 0) return []
  const intervalSeconds = timeframeMinutes(selectedTimeframe.value) * 60
  return mergePositionsByTime(rawKline.value, datedPositions.value, intervalSeconds)
})

/**
 * 预热段转为中性 KlinePoint（无仓位）。
 *
 * 刻意不走业务的 `mergePositions`：它对无开仓标记的跨日仓位会 fallback 到
 * `startIdx = 0`（见 utils/klineV2.ts），那会把浮动 ROI 一路涂满整个预热段。
 * 预热 bar 在业务区间之外，本就没有持仓语义。
 */
const warmupKlineData = computed<KlinePoint[]>(() =>
  warmupKline.value.map(p => ({
    timestamp: p.timestamp,
    datetime: p.datetime,
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
    position_id: '',
    entry_price: 0,
    position_type: 'long' as const,
    pnl_pct: 0,
    is_entry: false,
    is_exit: false,
  })),
)

/**
 * 喂给图表的完整序列 = 预热段 + 业务段。
 * 业务段为空时不传预热段，避免图上只剩历史 bar。
 */
const chartKlineData = computed<KlinePoint[]>(() => {
  if (processedKlineData.value.length === 0) return []
  return [...warmupKlineData.value, ...processedKlineData.value]
})

/** 图表需跳过的开头根数（预热段长度）；业务段为空时为 0 */
const warmupCount = computed(() =>
  processedKlineData.value.length === 0 ? 0 : warmupKlineData.value.length,
)

const emptyData = computed(() => !loading.value && !error.value && rawKline.value.length === 0)

/**
 * 实际显示的 K 线数量：始终尊重用户选择的 displayCount，
 * 但不超过**业务段**数据量（预热段不可见，不应计入）。
 */
const effectiveDisplayCount = computed(() => {
  const n = processedKlineData.value.length
  if (n === 0) return displayCount.value
  return Math.min(displayCount.value, n)
})

const dataWarning = computed(() => {
  const n = processedKlineData.value.length
  if (n > 0 && n < 20) {
    return `当前周期数据不足（${n} 根），建议选择更短的时间周期或查看更长时间范围`
  }
  return null
})

/**
 * 预热数据不完整时的告警。
 *
 * 各周期聚合 CSV 的时间覆盖可能不一致，预热序列与业务区间之间存在缺口时，
 * 指标开头会基于过期数据；1m 回退路径还受 MAX_WARMUP_1M_DAYS 封顶。
 * 这两种情况都显式提示，而不是静默给出失真数值。
 */
const warmupWarning = computed(() => {
  if (loading.value || error.value) return null
  if (processedKlineData.value.length === 0) return null
  if (warmupNeeded.value === 0) return null

  const actual = warmupKline.value.length
  if (actual === 0) {
    return `未取到指标预热数据（需 ${warmupNeeded.value} 根），图表开头的技术指标可能缺失或不准确`
  }

  const start = dateRange.value?.[0]
  if (warmupLastDate.value && start) {
    const gapDays = Math.round(
      (Date.parse(`${start}T00:00:00Z`) - Date.parse(`${warmupLastDate.value}T00:00:00Z`)) / 86400000,
    )
    // 相邻一天属正常衔接；超过 1 天说明预热数据源过期
    if (gapDays > 1) {
      return `指标预热数据截止 ${warmupLastDate.value}，与所选区间存在 ${gapDays} 天缺口，开头指标值可能不准确`
    }
  }

  if (warmupTruncated.value) {
    return `指标预热数据不足（需 ${warmupNeeded.value} 根，实得 ${actual} 根），开头指标值可能不准确`
  }
  return null
})

const chartSignals = computed<ChartSignalPoint[]>(() => [
  ...(showLiveSignals.value ? liveSignals.value : []),
  ...(showBacktestSignals.value ? backtestSignals.value : []),
])

watch(selectedTimeframe, (tf) => {
  displayCount.value = getDefaultDisplayCount(tf)
}, { immediate: true })

// 根据策略元数据设置默认指标
watch(strategyConfig, (config) => {
  if (config?.indicators?.length) {
    const implemented = config.indicators.filter(
      (i): i is IndicatorType => ['RSI', 'MACD', 'ATR', 'EMA', 'BOLL', 'KD', 'ADX', 'OBV', 'Donchian', 'Envelope', 'SMA'].includes(i)
    )
    if (implemented.length > 0) {
      selectedIndicators.value = implemented
      return
    }
  }
  selectedIndicators.value = ['RSI', 'MACD', 'ATR']
}, { immediate: true })

// ---- 点击交互：展开价格与 ROI 趋势图 ----
function handleEntryClick(entry: { position_id: string; position_type: string; entry_price: number; datetime: string }) {
  highlightPositionId.value = entry.position_id
  entryDialogTitle.value = `${entry.position_type === 'long' ? '做多' : '做空'}开仓 - $${entry.entry_price.toFixed(2)} - ${entry.datetime}`
  entryDialogVisible.value = true
}
function handleExitClick(exit: { position_id: string; position_type: string; exit_price: number; datetime: string }) {
  highlightPositionId.value = exit.position_id
  entryDialogTitle.value = `${exit.position_type === 'long' ? '做多' : '做空'}平仓 - $${exit.exit_price.toFixed(2)} - ${exit.datetime}`
  entryDialogVisible.value = true
}
function handleBarClick(bar: { datetime: string; open: number; high: number; low: number; close: number }) {
  highlightPositionId.value = ''
  entryDialogTitle.value = `K线 - ${bar.datetime}`
  entryDialogVisible.value = true
}

// ---- 数据加载 ----
async function fetchPositionsForRange(dates: string[]): Promise<DatedPosition[]> {
  if (!dirName.value || dates.length === 0) return []
  const days = dates.map((iso) => ({
    day: isoToYyyymmdd(iso),
    strategies: [dirName.value],
    hasLive: true,
    hasBacktest: true,
    updatedAt: '',
  }))
  // 策略级 live_positions.csv，跨日按 position_id 去重（CLOSED 优先）
  const rows = await loadLivePositions(days, { symbol: props.symbol })
  return rows.map((row) => {
    const positionDate =
      (row.entryTime || row.exitTime || '').slice(0, 10) ||
      (row.day ? yyyymmddToIso(row.day) : dates[0])
    return { ...toChartPosition(row), date: positionDate }
  })
}

function actionOf(row: { action: 'open' | 'close'; direction: 'long' | 'short' }): Signal['action'] {
  if (row.action === 'open') return row.direction === 'long' ? 'buy' : 'sell'
  return row.direction === 'long' ? 'sell_close' : 'buy_close'
}

function toChartSignal(
  row: SignalRow,
  source: 'live' | 'backtest',
  statusMap: Map<string, string>,
): ChartSignalPoint {
  return {
    time: row.signalTime.replace('T', ' ').slice(0, 19),
    price: row.price,
    side: row.side,
    action: row.action,
    direction: row.direction,
    source,
    reason: row.reason,
    status: statusMap.get(row.signalId),
  }
}

function dedupeSignals(rows: SignalRow[]): SignalRow[] {
  const map = new Map<string, SignalRow>()
  for (const row of rows) {
    const key = row.signalId || `${row.symbol}|${row.signalTime}|${row.side}|${row.action}`
    if (!map.has(key)) map.set(key, row)
  }
  return [...map.values()]
}

function registerMeta(meta: StrategyMetaV2): void {
  const logic = meta.logic as { entry?: unknown; exit?: unknown; risk?: unknown }
  const strings = (value: unknown): string[] | undefined =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : undefined
  setStrategyMeta(dirName.value, {
    display_name: meta.displayName,
    description: meta.description,
    indicators: meta.indicators,
    indicator_params: meta.indicatorParams as unknown as StrategyMeta['indicator_params'],
    logic: {
      entry: strings(logic.entry),
      exit: strings(logic.exit),
      risk: strings(logic.risk),
    },
  })
}

/** signal_comparison.csv → 旧 ComparisonReport 需要的数据结构 */
function buildComparison(
  rows: SignalComparisonRow[],
  liveMap: Map<string, SignalRow>,
  backtestMap: Map<string, SignalRow>,
): SignalComparison | undefined {
  if (rows.length === 0) return undefined
  const matched = rows.filter((row) => row.recordType === 'matched')
  const unmatchedLive = rows.filter((row) => row.recordType === 'unmatched_live')
  const unmatchedBacktest = rows.filter((row) => row.recordType === 'unmatched_backtest')

  const toSignal = (row: (typeof rows)[number], side: 'live' | 'backtest'): Signal => {
    const id = side === 'live' ? row.liveSignalId : row.backtestSignalId
    const signal = (side === 'live' ? liveMap : backtestMap).get(id)
    const time = side === 'live' ? row.liveTime : row.backtestTime
    return {
      signal_id: id || undefined,
      live_signal_id: row.liveSignalId || undefined,
      backtest_signal_id: row.backtestSignalId || undefined,
      time: time || undefined,
      side: row.signalSide === 'sell' || signal?.side === 'SELL' ? 'sell' : 'buy',
      action: signal
        ? actionOf(signal)
        : row.signalAction === 'close'
          ? 'sell_close'
          : row.signalSide === 'sell'
            ? 'sell'
            : 'buy',
      reason: signal?.reason,
      live_price: row.livePrice ?? signal?.price,
      backtest_price: row.backtestPrice ?? signal?.price,
      match_type: row.matchType,
      time_diff_seconds: row.timeDiffSeconds ?? undefined,
      price_diff_pct: row.priceDiffPct ?? undefined,
    }
  }

  const compared =
    matched.length + unmatchedLive.length + unmatchedBacktest.length
  return {
    strategy: dirName.value,
    symbol: props.symbol,
    date: dateRange.value?.[0] ?? '',
    total_live: liveMap.size,
    total_backtest: backtestMap.size,
    matched: matched.length,
    accuracy_score: compared > 0 ? matched.length / compared : 0,
    unmatched_live: unmatchedLive.map((row) => toSignal(row, 'live')),
    unmatched_backtest: unmatchedBacktest.map((row) => toSignal(row, 'backtest')),
    matched_signals: matched.map((row) => ({
      ...toSignal(row, 'live'),
      match_type: row.matchType || 'matched',
    })),
  }
}

interface RangeSignals {
  live: ChartSignalPoint[]
  backtest: ChartSignalPoint[]
  comparison?: SignalComparison
  mode: '' | 'live' | 'paper_trading' | 'smoking'
}

/** 跨日读取实盘/回放信号、对比结果与策略元数据 */
async function fetchSignalsForRange(dates: string[]): Promise<RangeSignals> {
  const empty: RangeSignals = { live: [], backtest: [], mode: '' }
  if (!dirName.value || dates.length === 0) return empty
  signalsLoading.value = true
  try {
    const perDay = await Promise.all(
      dates.map(async (iso) => {
        const day = isoToYyyymmdd(iso)
        const [liveRows, backtestRows, comparisonRows, meta] = await Promise.all([
          dataRepository.getLiveSignals(day, dirName.value, props.symbol),
          dataRepository.getBacktestSignals(day, dirName.value, {
            symbol: props.symbol,
            latestOnly: true,
          }),
          dataRepository.getSignalComparison(day, dirName.value, props.symbol),
          dataRepository.getStrategyMeta(day, dirName.value),
        ])
        if (meta) registerMeta(meta)
        return { liveRows, backtestRows, comparisonRows }
      }),
    )

    const liveRows = dedupeSignals(perDay.flatMap((day) => day.liveRows))
    const backtestRows = dedupeSignals(perDay.flatMap((day) => day.backtestRows))
    const comparisonRows = perDay.flatMap((day) => day.comparisonRows)

    const statusMap = new Map<string, string>()
    for (const row of comparisonRows) {
      const status = row.recordType === 'matched' ? 'matched' : 'missed'
      if (row.liveSignalId) statusMap.set(row.liveSignalId, status)
      if (row.backtestSignalId) statusMap.set(row.backtestSignalId, status)
    }

    const liveMap = new Map(liveRows.map((row) => [row.signalId, row]))
    const backtestMap = new Map(backtestRows.map((row) => [row.signalId, row]))
    const first = liveRows[0] ?? backtestRows[0]
    const mode =
      first && (first.tradingMode === 'live' || first.tradingMode === 'paper_trading' || first.tradingMode === 'smoking')
        ? first.tradingMode
        : ''

    return {
      live: liveRows.map((row) => toChartSignal(row, 'live', statusMap)),
      backtest: backtestRows.map((row) => toChartSignal(row, 'backtest', statusMap)),
      comparison: buildComparison(comparisonRows, liveMap, backtestMap),
      mode,
    }
  } finally {
    signalsLoading.value = false
  }
}

async function fetchData() {
  if (!dateRange.value) {
    error.value = '请选择日期范围'
    loading.value = false
    return
  }
  const [start, end] = dateRange.value
  loading.value = true
  error.value = null
  comparisonData.value = undefined
  try {
    const dates = enumerateDates(start, end)
    const bars = warmupBarsFor(
      selectedIndicators.value,
      getStrategyMeta(dirName.value)?.indicator_params,
    )
    warmupNeeded.value = bars

    // 一次取预热+业务；仓位与信号并行加载
    const [series, positions, signals] = await Promise.all([
      klineService.getSeriesWithWarmup(
        props.symbol,
        selectedTimeframe.value,
        bars,
        start,
        end,
      ),
      fetchPositionsForRange(dates),
      fetchSignalsForRange(dates),
    ])

    rawKline.value = series.business
    warmupKline.value = series.warmup
    warmupLastDate.value = series.warmup.length
      ? series.warmup[series.warmup.length - 1].datetime.slice(0, 10)
      : null
    warmupTruncated.value = series.truncated
    datedPositions.value = positions
    liveSignals.value = signals.live
    backtestSignals.value = signals.backtest
    comparisonData.value = signals.comparison
    tradingMode.value = signals.mode
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败'
    rawKline.value = []
    datedPositions.value = []
    warmupKline.value = []
    liveSignals.value = []
    backtestSignals.value = []
  } finally {
    loading.value = false
  }
}

function onDateRangeChange() {
  fetchData()
}

/**
 * 周期或指标变化都会改变 K 线聚合与预热根数，直接重新加载（结果有缓存）。
 */
watch([selectedTimeframe, selectedIndicators], () => {
  if (!loading.value) fetchData()
})

// 弹窗打开后触发 resize，让 ECharts 正确计算尺寸
watch(entryDialogVisible, (visible) => {
  if (visible) {
    setTimeout(() => window.dispatchEvent(new Event('resize')), 200)
  }
})

async function initDefaultDate() {
  // 直接打开（无日期参数）时对齐数据最新一天
  if (route.query.from || route.query.to || route.query.date) return
  const latest = await getLatestCatalogDay()
  if (latest) dateRange.value = [latest.iso, latest.iso]
}

onMounted(async () => {
  await initDefaultDate()
  fetchData()
})
</script>

<style scoped lang="scss">
.token-detail-v2 {
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 20px;
  font-size: 14px;
  transition: all 0.2s;

  &:hover {
    background: #f9fafb;
  }
}

.loading,
.error {
  text-align: center;
  padding: 40px;
  font-size: 16px;
  color: #6b7280;
}

.error {
  color: #ef4444;
}

.detail-header {
  background: white;
  padding: 20px 30px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  margin-bottom: 20px;

  h2 {
    margin: 0 0 10px 0;
  }

  p {
    color: #6b7280;
    margin: 0 0 15px 0;
  }

  .muted {
    color: #9ca3af;
  }
}

.date-range-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: white;
  border-radius: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;

  .bar-label {
    font-weight: 600;
    color: #374151;
  }

  .reload-btn {
    padding: 6px 14px;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    transition: background 0.2s;

    &:hover {
      background: #2563eb;
    }
  }
}

.chart-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.backplay-toggle {
  display: flex;
  align-items: center;
  gap: 12px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  color: #374151;

  input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }
}

.backplay-status {
  padding: 4px 12px;
  background: #f3f4f6;
  color: #6b7280;
  border-radius: 12px;
  font-size: 12px;

  &.success {
    background: #dcfce7;
    color: #166534;
  }
}

.data-warning {
  padding: 0.75rem 1rem;
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-radius: 6px;
  margin-bottom: 1rem;
  color: #92400e;
  font-size: 0.9rem;
}

.strategy-logic-inline {
  margin-top: 15px;
  border-top: 1px solid #e5e7eb;
  padding-top: 15px;
}

.logic-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.logic-label {
  font-size: 14px;
  color: #6b7280;
}

.btn-toggle-inline {
  background: none;
  border: none;
  color: #3b82f6;
  font-size: 13px;
  cursor: pointer;
  padding: 0;

  &:hover {
    text-decoration: underline;
  }
}

.logic-content-inline {
  margin-top: 15px;
  padding: 15px;
  background: #f9fafb;
  border-radius: 8px;
  max-height: 300px;
  overflow-y: auto;
}

.logic-section-inline {
  margin-bottom: 12px;

  &:last-child {
    margin-bottom: 0;
  }
}

.logic-title-inline {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 5px;
}

.logic-section-inline ul {
  margin: 0;
  padding-left: 20px;
  font-size: 13px;
  color: #4b5563;

  li {
    margin-bottom: 3px;
  }
}
</style>

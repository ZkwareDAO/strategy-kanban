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
          <span v-if="runtimeName"> | 运行实例: {{ runtimeName }}</span>
          <span v-else class="muted"> | 纯K线模式（无仓位叠加）</span>
        </p>
        <el-tag :type="modeTagType">{{ modeLabel }}</el-tag>
      </div>

      <!-- Strategy Logic Inline -->
      <div class="strategy-logic-inline">
        <div class="logic-toggle" @click="logicExpanded = !logicExpanded">
          <span class="logic-label">策略逻辑:</span>
          <button class="btn-toggle-inline">{{ logicExpanded ? '[收起 ▲]' : '[展开 ▼]' }}</button>
        </div>
        <div v-show="logicExpanded" class="logic-content-inline">
          <div class="logic-section-inline">
            <div class="logic-title-inline">【开仓条件】</div>
            <ul>
              <li v-for="(rule, idx) in strategyLogic.entry_conditions.rules" :key="idx">{{ rule }}</li>
            </ul>
          </div>
          <div class="logic-section-inline">
            <div class="logic-title-inline">【平仓条件】</div>
            <ul>
              <li v-for="(rule, idx) in strategyLogic.exit_conditions.rules" :key="idx">{{ rule }}</li>
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
            <input type="checkbox" v-model="showBackplay" :disabled="!dirName" />
            <span>回放对比</span>
          </label>
          <span v-if="backplayLoading" class="backplay-status">加载中...</span>
          <span v-else-if="backplayTrades.length === 0 && showBackplay" class="backplay-status">无回放数据</span>
          <span v-else-if="backplayTrades.length > 0" class="backplay-status success">
            {{ backplayTrades.length }} 条回放信号
          </span>
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
        :backplay-signals="showBackplay ? backplaySignals : undefined"
        @entry-click="handleEntryClick"
        @exit-click="handleExitClick"
        @bar-click="handleBarClick"
      />

      <!-- 仓位详情弹框 -->
      <el-dialog v-model="entryDialogVisible" :title="entryDialogTitle" width="90%" top="5vh">
        <PriceRoiChart
          v-if="entryDialogVisible"
          :timeline-data="mergedKline"
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
import { getPositions, getBacktestTrades, getComparison } from '@/api/strategy'
import { getKlineV2 } from '@/api/klineV2'
import { getWarmupKline } from '@/api/klineWarmup'
import { usePositionOverlay, toDatedPositions } from '@/composables/usePositionOverlay'
import { resampleKline, getDefaultDisplayCount } from '@/utils/resample'
import { enumerateDates } from '@/utils/klineRange'
import type { RawKlinePoint } from '@/models/klineV2'
import type { KlinePoint, TimeframeValue } from '@/models/kline'
import type { DatedPosition } from '@/utils/klineV2'
import { warmupBarsFor, type IndicatorType } from '@/indicators'
import type { BacktestSignal } from '@/models/backtest'
import TechnicalChart from '@/components/detail/TechnicalChart.vue'
import IndicatorPanel from '@/components/detail/IndicatorPanel.vue'
import TimeframeSelector from '@/components/detail/TimeframeSelector.vue'
import PriceRoiChart from '@/components/detail/PriceRoiChart.vue'
import ComparisonReport from '@/components/detail/ComparisonReport.vue'
import type { SignalComparison, StrategyLogic as StrategyLogicType } from '@/models/detail'
import { getStrategyMeta, loadStrategyMeta, strategyMeta, type StrategyMeta } from '@/api/strategyMeta'

const props = defineProps<{ strategy: string; symbol: string }>()
const route = useRoute()

/** 运行实例名（可选）。存在则按日叠加仓位；缺失则为纯K线模式 */
const runtimeName = computed(() => (route.query.runtime as string) ?? '')
/** frontend_data 下的策略目录名（如 DOLPHINV2_4H_2），从 query.dir 读取 */
const dirName = computed(() => (route.query.dir as string) ?? '')

const tradingMode = computed(() => {
  const name = (runtimeName.value || '').toUpperCase()
  if (name.includes('_LIVE') || name.endsWith('LIVE')) return 'live'
  if (name.includes('_PAPER') || name.endsWith('PAPER')) return 'paper_trading'
  if (name.includes('_SMOKING') || name.endsWith('SMOKING')) return 'smoking'
  return ''
})

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

const showBackplay = ref(false)
const backplayLoading = ref(false)
const backplayTrades = ref<BacktestSignal[]>([])

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
const strategyPrefix = computed(() => props.strategy)
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

// ---- 仓位 overlay 与重采样（复用 v1 resampleKline，输入为 v1 形状 KlinePoint[]）----
const { merged: mergedKline } = usePositionOverlay(rawKline, datedPositions)

const processedKlineData = computed<KlinePoint[]>(() => {
  if (mergedKline.value.length === 0) return []
  return resampleKline(mergedKline.value, selectedTimeframe.value)
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

const backplaySignals = computed(() => backplayTrades.value)

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
  const results = await Promise.all(
    dates.map(async (iso) => {
      try {
        const positions = await getPositions(dirName.value, props.symbol, isoToYyyymmdd(iso))
        return toDatedPositions(positions, iso)
      } catch {
        return [] as DatedPosition[]
      }
    }),
  )
  return results.flat()
}

/** 获取日期范围内第一个可用的 comparison.json */
async function fetchComparisonForRange(dates: string[]): Promise<void> {
  if (!dirName.value) return
  for (const iso of dates) {
    try {
      const data = await getComparison(dirName.value, props.symbol, isoToYyyymmdd(iso))
      comparisonData.value = data
      return
    } catch {
      // try next date
    }
  }
  comparisonData.value = undefined
}

/**
 * 加载指标预热段：业务区间之前的历史 bar，只参与指标计算不参与显示。
 *
 * 根数由当前所选指标决定（取各指标 warmupBars 的最大值），因此切换周期或
 * 增减指标都需重新取；失败不阻断页面——最坏退化为修复前的行为（开头缺指标），
 * 并由 [[warmupWarning]] 提示。
 */
async function fetchWarmup(startDate: string): Promise<void> {
  const params = getStrategyMeta(props.strategy)?.indicator_params
  const bars = warmupBarsFor(selectedIndicators.value, params)
  warmupNeeded.value = bars
  if (bars === 0) {
    warmupKline.value = []
    warmupLastDate.value = null
    warmupTruncated.value = false
    return
  }
  const result = await getWarmupKline(props.symbol, selectedTimeframe.value, bars, startDate)
  warmupKline.value = result.bars
  warmupLastDate.value = result.lastDate
  warmupTruncated.value = result.truncated
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
    // 预热段与业务数据并行；预热失败不影响主流程（catch 内清空即可）
    const [kline, positions] = await Promise.all([
      getKlineV2(props.symbol, start, end),
      fetchPositionsForRange(dates),
      fetchWarmup(start).catch(() => {
        warmupKline.value = []
        warmupLastDate.value = null
        warmupTruncated.value = true
      }),
    ])
    rawKline.value = kline
    datedPositions.value = positions
    // 对比数据取日期范围内第一个可用的
    fetchComparisonForRange(dates)
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败'
    rawKline.value = []
    datedPositions.value = []
    warmupKline.value = []
  } finally {
    loading.value = false
  }
}

async function fetchBackplayData() {
  if (!dateRange.value) return
  backplayLoading.value = true
  try {
    if (!dirName.value) {
      backplayTrades.value = []
      return
    }
    const dates = enumerateDates(dateRange.value[0], dateRange.value[1])
    const tradesPerDay = await Promise.all(
      dates.map((iso) =>
        getBacktestTrades(isoToYyyymmdd(iso), dirName.value, props.symbol).catch(() => []),
      ),
    )
    const signals: BacktestSignal[] = []
    for (const trade of tradesPerDay.flat()) {
      const isLong = trade.side === 'BUY' || trade.side === 'BUY_CLOSE'
      const isOpen = trade.side === 'BUY' || trade.side === 'SELL'
      const datetime = trade.timestamp.replace('T', ' ').substring(0, 19)
      signals.push({
        datetime,
        price: trade.price,
        position_type: isLong ? 'long' : 'short',
        action: isOpen ? 'open' : 'close',
      })
    }
    backplayTrades.value = signals
  } catch (err) {
    console.error('[v2] backplay failed:', err)
    backplayTrades.value = []
  } finally {
    backplayLoading.value = false
  }
}

function onDateRangeChange() {
  // 日期范围变化后清空回放缓存并重新加载K线/仓位
  backplayTrades.value = []
  fetchData()
}

watch(showBackplay, (v) => {
  if (v && backplayTrades.value.length === 0) fetchBackplayData()
})

/**
 * 周期或指标变化会改变所需预热根数（如切到更大周期、或勾上长窗口指标），
 * 需重新取预热段。只重取预热，不动业务数据——业务区间未变。
 */
watch([selectedTimeframe, selectedIndicators], () => {
  const start = dateRange.value?.[0]
  if (!start || loading.value) return
  fetchWarmup(start).catch(() => {
    warmupKline.value = []
    warmupLastDate.value = null
    warmupTruncated.value = true
  })
}, { deep: true })

// 弹窗打开后触发 resize，让 ECharts 正确计算尺寸
watch(entryDialogVisible, (visible) => {
  if (visible) {
    setTimeout(() => window.dispatchEvent(new Event('resize')), 200)
  }
})

onMounted(() => {
  // 策略元数据与业务数据并行加载，失败不影响页面（内部已兜底）
  loadStrategyMeta()
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

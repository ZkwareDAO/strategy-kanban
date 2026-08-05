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
        <el-tag :type="runtimeName ? 'success' : 'info'">
          {{ runtimeName ? '含仓位叠加' : '仅K线' }}
        </el-tag>
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
            <input type="checkbox" v-model="showBackplay" :disabled="!runtimeName" />
            <span>回放对比</span>
          </label>
          <span v-if="backplayLoading" class="backplay-status">加载中...</span>
          <span v-else-if="backplayTrades.length === 0 && showBackplay" class="backplay-status">无回放数据</span>
          <span v-else-if="backplayTrades.length > 0" class="backplay-status success">
            {{ backplayTrades.length }} 条回放信号
          </span>
        </div>
        <IndicatorPanel v-model="selectedIndicators" />
      </div>

      <TimeframeSelector v-model="selectedTimeframe" v-model:display-count="displayCount" />
      <div v-if="dataWarning" class="data-warning">⚠️ {{ dataWarning }}</div>
      <div v-if="emptyData" class="data-warning">⚠️ 所选范围内无K线数据，请调整日期范围</div>

      <!-- 复用 v1 TechnicalChart（已是解耦渲染组件，仅消费 KlinePoint[]） -->
      <TechnicalChart
        :kline-data="processedKlineData"
        :strategy="strategy"
        :symbol="symbol"
        :indicators="selectedIndicators"
        :display-count="effectiveDisplayCount"
        :backplay-signals="showBackplay ? backplaySignals : undefined"
        @entry-click="handleEntryClick"
        @exit-click="handleExitClick"
      />

      <!-- 仓位详情弹框（v2 无每 bar 的 pnl_pct，改用持仓字段展示，避免误导性的空 ROI 曲线） -->
      <el-dialog v-model="entryDialogVisible" :title="entryDialogTitle" width="60%" top="10vh">
        <div v-if="clickedPosition" class="position-detail">
          <div class="detail-row"><span>仓位ID:</span><code>{{ clickedPosition.position_id }}</code></div>
          <div class="detail-row"><span>方向:</span>{{ clickedPosition.type === 'long' ? '做多' : '做空' }}</div>
          <div class="detail-row"><span>开仓时间:</span>{{ clickedPosition.date }} {{ clickedPosition.entry_time }}</div>
          <div class="detail-row"><span>开仓价:</span>{{ clickedPosition.entry_price.toFixed(2) }}</div>
          <div v-if="clickedPosition.exit_time" class="detail-row">
            <span>平仓时间:</span>{{ clickedPosition.date }} {{ clickedPosition.exit_time }}
          </div>
          <div class="detail-row"><span>实现收益率:</span>{{ clickedPosition.realized_pnl.toFixed(2) }}%</div>
          <div class="detail-row"><span>最大潜在收益:</span>{{ clickedPosition.max_potential_pnl.toFixed(2) }}%</div>
          <div class="detail-row"><span>最大回撤:</span>{{ clickedPosition.max_drawdown.toFixed(2) }}%</div>
        </div>
      </el-dialog>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getPositions, getBacktestTrades } from '@/api/strategy'
import { getKlineV2 } from '@/api/klineV2'
import { usePositionOverlay, toDatedPositions } from '@/composables/usePositionOverlay'
import { resampleKline, getDefaultDisplayCount } from '@/utils/resample'
import { enumerateDates } from '@/utils/klineRange'
import type { RawKlinePoint } from '@/models/klineV2'
import type { KlinePoint, TimeframeValue } from '@/models/kline'
import type { DatedPosition } from '@/utils/klineV2'
import type { IndicatorType } from '@/indicators'
import type { BacktestSignal } from '@/models/backtest'
import TechnicalChart from '@/components/detail/TechnicalChart.vue'
import IndicatorPanel from '@/components/detail/IndicatorPanel.vue'
import TimeframeSelector from '@/components/detail/TimeframeSelector.vue'

const props = defineProps<{ strategy: string; symbol: string }>()
const route = useRoute()

/** 运行实例名（可选）。存在则按日叠加仓位；缺失则为纯K线模式 */
const runtimeName = computed(() => (route.query.runtime as string) ?? '')

const loading = ref(true)
const error = ref<string | null>(null)
const rawKline = ref<RawKlinePoint[]>([])
const datedPositions = ref<DatedPosition[]>([])
const selectedIndicators = ref<IndicatorType[]>(['RSI', 'MACD', 'ATR'])
const selectedTimeframe = ref<TimeframeValue>('5m')
const displayCount = ref(100)

const showBackplay = ref(false)
const backplayLoading = ref(false)
const backplayTrades = ref<BacktestSignal[]>([])

const entryDialogVisible = ref(false)
const entryDialogTitle = ref('')
const clickedPosition = ref<DatedPosition | null>(null)

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

const hasPositions = computed(() => datedPositions.value.length > 0)
const emptyData = computed(() => !loading.value && !error.value && rawKline.value.length === 0)

/**
 * 纯K线模式：展示全部 bar（让用户看到完整区间）；
 * 含仓位模式：沿用 v1 的 displayCount（以首开仓点为中心），并按数据量上限截断。
 */
const effectiveDisplayCount = computed(() => {
  const n = processedKlineData.value.length
  if (n === 0) return displayCount.value
  if (!hasPositions.value) return n
  return Math.min(displayCount.value, n)
})

const dataWarning = computed(() => {
  const n = processedKlineData.value.length
  if (n > 0 && n < 20) {
    return `当前周期数据不足（${n} 根），建议选择更短的时间周期或查看更长时间范围`
  }
  return null
})

const backplaySignals = computed(() => backplayTrades.value)

watch(selectedTimeframe, (tf) => {
  displayCount.value = getDefaultDisplayCount(tf)
}, { immediate: true })

// ---- 点击交互：按 position_id 查找持仓并展开详情 ----
function findPosition(positionId: string): DatedPosition | null {
  return datedPositions.value.find(p => p.position_id === positionId) ?? null
}
function handleEntryClick(entry: { position_id: string; position_type: string; entry_price: number; datetime: string }) {
  clickedPosition.value = findPosition(entry.position_id)
  entryDialogTitle.value = `${entry.position_type === 'long' ? '做多' : '做空'}开仓 - $${entry.entry_price.toFixed(2)} - ${entry.datetime}`
  entryDialogVisible.value = true
}
function handleExitClick(exit: { position_id: string; position_type: string; exit_price: number; datetime: string }) {
  clickedPosition.value = findPosition(exit.position_id)
  entryDialogTitle.value = `${exit.position_type === 'long' ? '做多' : '做空'}平仓 - $${exit.exit_price.toFixed(2)} - ${exit.datetime}`
  entryDialogVisible.value = true
}

// ---- 数据加载 ----
async function fetchPositionsForRange(dates: string[]): Promise<DatedPosition[]> {
  if (!runtimeName.value || dates.length === 0) return []
  const results = await Promise.all(
    dates.map(async (iso) => {
      try {
        const positions = await getPositions(runtimeName.value, isoToYyyymmdd(iso))
        return toDatedPositions(positions, iso)
      } catch {
        return [] as DatedPosition[]
      }
    }),
  )
  return results.flat()
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
  try {
    const dates = enumerateDates(start, end)
    const [kline, positions] = await Promise.all([
      getKlineV2(props.symbol, start, end),
      fetchPositionsForRange(dates),
    ])
    rawKline.value = kline
    datedPositions.value = positions
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败'
    rawKline.value = []
    datedPositions.value = []
  } finally {
    loading.value = false
  }
}

async function fetchBackplayData() {
  if (!dateRange.value) return
  backplayLoading.value = true
  try {
    const dates = enumerateDates(dateRange.value[0], dateRange.value[1])
    const tradesPerDay = await Promise.all(
      dates.map((iso) =>
        getBacktestTrades(isoToYyyymmdd(iso), props.strategy, props.symbol).catch(() => []),
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

onMounted(fetchData)
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

.position-detail {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 8px 4px;

  .detail-row {
    display: flex;
    gap: 12px;
    font-size: 14px;
    color: #374151;

    span {
      min-width: 96px;
      color: #6b7280;
    }

    code {
      background: #f3f4f6;
      padding: 1px 8px;
      border-radius: 4px;
      font-size: 13px;
    }
  }
}
</style>

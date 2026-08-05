<template>
  <div class="backtest-overview">
    <div v-if="loading" class="state">加载中...</div>
    <div v-else-if="rows.length === 0" class="state">暂无回测数据</div>
    <template v-else>
      <!-- 筛选 & 排序栏 -->
      <div class="toolbar">
        <el-select
          v-model="selectedStrategy"
          placeholder="全部策略"
          clearable
          size="default"
          class="strategy-filter"
        >
          <el-option
            v-for="s in strategyOptions"
            :key="s"
            :label="s"
            :value="s"
          />
        </el-select>
        <el-select
          v-model="sortKey"
          size="default"
          class="sort-select"
        >
          <el-option
            v-for="opt in sortOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
        <el-button
          size="default"
          class="sort-dir-btn"
          @click="sortAsc = !sortAsc"
        >
          {{ sortAsc ? '↑ 升序' : '↓ 降序' }}
        </el-button>
        <span class="row-count">{{ displayRows.length }} 条记录</span>
      </div>

      <!-- 卡片列表 -->
      <div class="card-list">
        <div
          v-for="row in displayRows"
          :key="row.path"
          class="backtest-card"
          @click="handleRowClick(row)"
        >
          <!-- 左：策略 + 代币 -->
          <div class="card-identity">
            <span class="card-strategy">{{ row.strategy }}</span>
            <span class="card-symbol">{{ row.symbol }}</span>
          </div>
          <!-- 右：核心指标 -->
          <div class="card-metrics">
            <div class="metric-item">
              <span class="metric-label">ROE</span>
              <span :class="pctClass(row.result?.metrics?.roe)" class="metric-value">{{ fmtPct(row.result?.metrics?.roe) }}</span>
            </div>
            <div class="metric-item">
              <span class="metric-label">总收益</span>
              <span :class="pctClass(row.result?.metrics?.total_return)" class="metric-value">{{ fmtPct(row.result?.metrics?.total_return) }}</span>
            </div>
            <div class="metric-item">
              <span class="metric-label">最大回撤</span>
              <span class="metric-value val-danger">{{ fmtPct(row.result?.metrics?.max_drawdown) }}</span>
            </div>
            <div class="metric-item">
              <span class="metric-label">胜率</span>
              <span :class="winRateClass(row.result?.metrics?.win_rate)" class="metric-value">{{ fmtPct(row.result?.metrics?.win_rate) }}</span>
            </div>
            <div class="metric-item">
              <span class="metric-label">交易</span>
              <span class="metric-value">{{ fmtInt(row.result?.trades_count) }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- 弹窗：指标分组展示 -->
    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="720px" destroy-on-close>
      <div v-if="dialogRow" class="detail">
        <!-- 基本信息 -->
        <div class="detail-section">
          <h4>基本信息</h4>
          <div class="detail-row"><span>策略</span><b>{{ dialogRow.strategy }}</b></div>
          <div class="detail-row"><span>代币</span><b>{{ dialogRow.symbol }}</b></div>
          <div class="detail-row"><span>回测运行</span><b>{{ formatDate(dialogRow.date) }} {{ formatTime(dialogRow.time) }}</b></div>
          <div class="detail-row"><span>区间</span><b>{{ formatRange(dialogRow.result) }}</b></div>
          <div class="detail-row"><span>初始资金</span><b>{{ fmtNum(dialogRow.result?.config?.initial_cash, 0) }}</b></div>
          <div class="detail-row"><span>最终权益</span><b>{{ fmtNum(dialogRow.result?.accounts?.[0]?.total_equity, 2) }}</b></div>
          <div class="detail-row"><span>峰值权益</span><b>{{ fmtNum(dialogRow.result?.accounts?.[0]?.peak_equity, 2) }}</b></div>
          <div class="detail-row"><span>状态</span><b>{{ dialogRow.result?.status ?? '-' }}</b></div>
          <div class="detail-row"><span>耗时</span><b>{{ fmtDuration(dialogRow.result?.duration_seconds) }}</b></div>
        </div>

        <!-- 收益指标 -->
        <div class="detail-section">
          <h4>收益指标</h4>
          <div class="metrics-grid">
            <div v-for="m in revenueMetrics" :key="m.label" class="metric-cell">
              <span class="metric-label">{{ m.label }}</span>
              <b class="metric-value" :class="m.cls">{{ m.value }}</b>
            </div>
          </div>
        </div>

        <!-- 风险指标 -->
        <div class="detail-section">
          <h4>风险指标</h4>
          <div class="metrics-grid">
            <div v-for="m in riskMetrics" :key="m.label" class="metric-cell">
              <span class="metric-label">{{ m.label }}</span>
              <b class="metric-value" :class="m.cls">{{ m.value }}</b>
            </div>
          </div>
        </div>

        <!-- 交易统计 -->
        <div class="detail-section">
          <h4>交易统计</h4>
          <div class="metrics-grid">
            <div v-for="m in tradeMetrics" :key="m.label" class="metric-cell">
              <span class="metric-label">{{ m.label }}</span>
              <b class="metric-value">{{ m.value }}</b>
            </div>
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getBacktestIndex, getBacktestResult } from '@/api/backtest'
import type { BacktestResult } from '@/models/backtest'

/** 表格行：扁平化索引条目 + 对应回测结果 */
interface BacktestRow {
  strategy: string
  symbol: string
  date: string
  time: string
  path: string
  result: BacktestResult | null
}

const loading = ref(true)
const rows = ref<BacktestRow[]>([])
const dialogVisible = ref(false)
const dialogRow = ref<BacktestRow | null>(null)
const selectedStrategy = ref<string>('')
const sortKey = ref<string>('strategy')
const sortAsc = ref(false)

// ---- 排序选项 ----
const sortOptions = [
  { label: '按策略', value: 'strategy' },
  { label: '按代币', value: 'symbol' },
  { label: '按 ROE', value: 'roe' },
  { label: '按总收益', value: 'total_return' },
  { label: '按最大回撤', value: 'max_drawdown' },
  { label: '按胜率', value: 'win_rate' },
  { label: '按交易次数', value: 'trades_count' },
]

// ---- 筛选 ----
const strategyOptions = computed(() =>
  [...new Set(rows.value.map(r => r.strategy))].sort(),
)

const filteredRows = computed(() => {
  if (!selectedStrategy.value) return rows.value
  return rows.value.filter(r => r.strategy === selectedStrategy.value)
})

// ---- 排序 ----
type SortGetter = (row: BacktestRow) => string | number | undefined | null

const SORT_GETTERS: Record<string, SortGetter> = {
  strategy: r => r.strategy,
  symbol: r => r.symbol,
  roe: r => r.result?.metrics?.roe,
  total_return: r => r.result?.metrics?.total_return,
  max_drawdown: r => r.result?.metrics?.max_drawdown,
  win_rate: r => r.result?.metrics?.win_rate,
  trades_count: r => r.result?.trades_count,
}

const displayRows = computed(() => {
  const getter = SORT_GETTERS[sortKey.value] ?? SORT_GETTERS.strategy
  const sorted = [...filteredRows.value].sort((a, b) => {
    const va = getter(a)
    const vb = getter(b)
    // 缺失值排到最后
    if (va == null) return vb == null ? 0 : 1
    if (vb == null) return -1
    // 字符串 vs 数值
    if (typeof va === 'string' && typeof vb === 'string') {
      return va.localeCompare(vb)
    }
    return (va as number) - (vb as number)
  })
  return sortAsc.value ? sorted : sorted.reverse()
})

// ---- 弹窗 ----
const dialogTitle = computed(() => {
  const r = dialogRow.value
  return r ? `${r.strategy} / ${r.symbol} 回测明细` : '回测明细'
})

/** 指标辅助类型 */
interface MetricItem {
  label: string
  value: string
  cls?: string
}

const revenueMetrics = computed<MetricItem[]>(() => {
  const m = dialogRow.value?.result?.metrics
  if (!m) return []
  return [
    { label: 'ROE', value: fmtPct(m.roe), cls: pctClass(m.roe) },
    { label: '总收益', value: fmtPct(m.total_return), cls: pctClass(m.total_return) },
    { label: '年化收益', value: fmtPct(m.annualized_return), cls: pctClass(m.annualized_return) },
  ]
})

const riskMetrics = computed<MetricItem[]>(() => {
  const m = dialogRow.value?.result?.metrics
  if (!m) return []
  return [
    { label: '夏普比率', value: fmtNum(m.sharpe_ratio, 2) },
    { label: '索提诺比率', value: fmtNum(m.sortino_ratio, 2) },
    { label: '最大回撤', value: fmtPct(m.max_drawdown), cls: 'val-danger' },
    { label: '胜率', value: fmtPct(m.win_rate), cls: winRateClass(m.win_rate) },
    { label: '盈亏比', value: fmtNum(m.profit_factor, 2) },
  ]
})

const tradeMetrics = computed<MetricItem[]>(() => {
  const m = dialogRow.value?.result?.metrics
  const r = dialogRow.value?.result
  if (!m && !r) return []
  return [
    { label: '交易次数', value: fmtInt(r?.trades_count) },
    { label: '信号数', value: fmtInt(r?.signals_processed) },
    { label: 'K线数', value: fmtInt(r?.klines_processed) },
    { label: '总交易数', value: fmtInt(m?.total_trades) },
    { label: '盈利交易', value: fmtInt(m?.winning_trades) },
    { label: '亏损交易', value: fmtInt(m?.losing_trades) },
    { label: '平均交易盈亏', value: fmtNum(m?.avg_trade_pnl, 2) },
    { label: '最大盈利', value: fmtNum(m?.largest_win, 2) },
    { label: '最大亏损', value: fmtNum(m?.largest_loss, 2) },
    { label: '平均盈利', value: fmtNum(m?.avg_win, 2) },
    { label: '平均亏损', value: fmtNum(m?.avg_loss, 2) },
    { label: '交易天数', value: fmtInt(m?.trading_days) },
  ]
})

// ---- 数据加载 ----
async function loadRows() {
  loading.value = true
  try {
    const entries = await getBacktestIndex()
    const fetched = await Promise.all(
      entries.map(async e => ({
        strategy: e.strategy,
        symbol: e.symbol,
        date: e.date,
        time: e.time,
        path: e.path,
        result: await getBacktestResult(e.path),
      })),
    )
    rows.value = fetched.filter(r => r.result && hasSignals(r.result))
  } finally {
    loading.value = false
  }
}

function hasSignals(result: BacktestResult): boolean {
  const sp = result.signals_processed
  return sp === undefined || sp > 0
}

function handleRowClick(row: BacktestRow) {
  dialogRow.value = row
  dialogVisible.value = true
}

// ---- 条件着色 ----
function pctClass(v: number | undefined | null): string {
  if (v == null || Number.isNaN(v)) return ''
  return v > 0 ? 'val-positive' : v < 0 ? 'val-negative' : ''
}

function winRateClass(v: number | undefined | null): string {
  if (v == null || Number.isNaN(v)) return ''
  return v >= 0.5 ? 'val-positive' : 'val-negative'
}

// ---- 格式化（缺失一律显示 "-"，不报错）----
function fmtPct(v: number | undefined | null): string {
  if (v == null || Number.isNaN(v)) return '-'
  return (v * 100).toFixed(2) + '%'
}
function fmtNum(v: number | undefined | null, digits = 2): string {
  if (v == null || Number.isNaN(v)) return '-'
  return v.toFixed(digits)
}
function fmtInt(v: number | undefined | null): string {
  if (v == null || Number.isNaN(v)) return '-'
  return String(Math.round(v))
}
function formatDate(date: string): string {
  if (!date || date.length !== 8) return date || '-'
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
}
function formatTime(time: string): string {
  if (!time || time.length !== 6) return time || ''
  return `${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}`
}
function formatRange(result: BacktestResult | null): string {
  const s = result?.config?.start_date
  const e = result?.config?.end_date
  if (!s && !e) return '-'
  return `${s ?? '?'} ~ ${e ?? '?'}`
}
function fmtDuration(v: number | undefined | null): string {
  if (v == null || Number.isNaN(v)) return '-'
  const min = Math.round(v / 60)
  if (min < 60) return `${min} 分钟`
  return `${Math.floor(min / 60)} 小时 ${min % 60} 分钟`
}

onMounted(loadRows)
</script>

<style scoped lang="scss">
.backtest-overview {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.state {
  padding: 48px;
  text-align: center;
  color: #6b7280;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;

  .strategy-filter {
    width: 200px;
  }

  .sort-select {
    width: 140px;
  }

  .row-count {
    font-size: 13px;
    color: #9ca3af;
  }
}

// ---- 卡片列表 ----
.card-list {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.backtest-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    border-color: #3b82f6;
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.12);
  }
}

.card-identity {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 140px;

  .card-strategy {
    font-size: 14px;
    font-weight: 600;
    color: #1f2937;
  }

  .card-symbol {
    font-size: 13px;
    color: #6b7280;
  }
}

.card-metrics {
  display: flex;
  gap: 24px;
  align-items: center;
}

.metric-item {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;

  .metric-label {
    font-size: 11px;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .metric-value {
    font-size: 15px;
    font-weight: 600;
    color: #1f2937;
  }
}

// ---- 条件着色 ----
.val-positive {
  color: #16a34a !important;
}

.val-negative {
  color: #dc2626 !important;
}

.val-danger {
  color: #dc2626 !important;
}

// ---- 弹窗 ----
.detail {
  .detail-section {
    margin-bottom: 20px;

    h4 {
      margin: 0 0 12px;
      font-size: 15px;
      color: #1a1a1a;
    }
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid #f3f4f6;
    font-size: 14px;

    span {
      color: #6b7280;
    }
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }

  .metric-cell {
    background: #f9fafb;
    border-radius: 8px;
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;

    .metric-label {
      font-size: 12px;
      color: #6b7280;
    }

    .metric-value {
      font-size: 15px;
    }
  }
}
</style>

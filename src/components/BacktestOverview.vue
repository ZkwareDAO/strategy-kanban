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

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
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
const selectedStrategy = ref<string>('')
const sortKey = ref<string>('strategy')
const sortAsc = ref(false)
const router = useRouter()

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

function handleRowClick(row: BacktestRow) {
  router.push({
    name: 'BacktestDetail',
    params: { strategy: row.strategy, symbol: row.symbol },
    query: { date: row.date, time: row.time, path: row.path },
  })
}

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
function fmtInt(v: number | undefined | null): string {
  if (v == null || Number.isNaN(v)) return '-'
  return String(Math.round(v))
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
</style>

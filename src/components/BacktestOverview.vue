<template>
  <div class="backtest-overview">
    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="filters">
        <el-select
          v-model="selectedStrategy"
          placeholder="全部策略"
          clearable
          class="strategy-filter"
        >
          <el-option
            v-for="s in availableStrategies"
            :key="s"
            :label="s"
            :value="s"
          />
        </el-select>
        <span class="row-count">{{ filteredGroups.length }} 条记录</span>
      </div>
    </div>

    <!-- 状态 -->
    <div v-if="loading" class="state">加载中...</div>
    <div v-else-if="filteredGroups.length === 0" class="state">暂无回测数据</div>

    <!-- 策略层级分组表格 -->
    <div v-else class="table-wrapper">
      <table class="group-table">
        <thead>
          <tr>
            <th class="sortable" @click="toggleSort('strategy')">
              策略名称 <span class="sort-arrow">{{ sortArrow('strategy') }}</span>
            </th>
            <th>代币</th>
            <th class="sortable" @click="toggleSort('best_annualized')">
              最佳年化 <span class="sort-arrow">{{ sortArrow('best_annualized') }}</span>
            </th>
            <th class="sortable" @click="toggleSort('interval')">
              回测区间 <span class="sort-arrow">{{ sortArrow('interval') }}</span>
            </th>
            <th class="sortable" @click="toggleSort('completed_at')">
              完成时间 <span class="sort-arrow">{{ sortArrow('completed_at') }}</span>
            </th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="g in sortedGroups" :key="groupKey(g)">
            <td class="col-name">{{ g.strategy }}</td>
            <td class="col-tokens">
              <span v-for="(sym, i) in g.symbols" :key="sym" class="token-chip">
                {{ stripUsdt(sym) }}<span v-if="i < g.symbols.length - 1" class="sep">|</span>
              </span>
            </td>
            <td :class="pctClass(g.best_annualized)">{{ fmtPct(g.best_annualized) }}</td>
            <td>{{ g.start_date }} ~ {{ g.end_date }}</td>
            <td class="col-time">{{ formatCompletedAt(g.completed_at) }}</td>
            <td>
              <button class="more-btn" @click="goTokenList(g)">更多</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getBacktestIndex, getBacktestResult } from '@/api/backtest'
import type { BacktestResult, BacktestOutputEntry, BacktestGroupRow } from '@/models/backtest'

const router = useRouter()

interface LoadedRow {
  strategy: string
  symbol: string
  date: string
  time: string
  path: string
  result: BacktestResult | null
}

const loading = ref(false)
const rows = ref<LoadedRow[]>([])
const selectedStrategy = ref('')

type SortKey = 'strategy' | 'best_annualized' | 'interval' | 'completed_at'
const sortKey = ref<SortKey>('best_annualized')
const sortAsc = ref(false)

const availableStrategies = computed(() => {
  const set = new Set(rows.value.map(r => r.strategy))
  return Array.from(set).sort()
})

// 按 strategy + 回测区间 分组
const groups = computed<BacktestGroupRow[]>(() => {
  const map = new Map<string, BacktestGroupRow>()
  for (const r of rows.value) {
    if (!r.result) continue
    const sd = r.result.config?.start_date ?? '?'
    const ed = r.result.config?.end_date ?? '?'
    const key = `${r.strategy}|${sd}|${ed}`
    let g = map.get(key)
    if (!g) {
      g = {
        strategy: r.strategy,
        symbols: [],
        best_annualized: -Infinity,
        start_date: sd,
        end_date: ed,
        completed_at: '',
        token_entries: [],
      }
      map.set(key, g)
    }
    g.symbols.push(r.symbol)
    const ar = r.result.metrics?.annualized_return
    if (typeof ar === 'number' && Number.isFinite(ar)) {
      g.best_annualized = Math.max(g.best_annualized, ar)
    }
    // 完成时间：end_time 优先，回退为索引 date+time
    const ts = r.result.end_time || `${r.date}T${r.time}`
    if (ts > g.completed_at) g.completed_at = ts
    g.token_entries.push({
      strategy: r.strategy,
      symbol: r.symbol,
      date: r.date,
      time: r.time,
      path: r.path,
    } as BacktestOutputEntry)
  }
  for (const g of map.values()) {
    g.symbols.sort()
  }
  return Array.from(map.values())
})

const filteredGroups = computed(() => {
  if (!selectedStrategy.value) return groups.value
  return groups.value.filter(g => g.strategy === selectedStrategy.value)
})

const sortedGroups = computed(() => {
  const arr = [...filteredGroups.value]
  const dir = sortAsc.value ? 1 : -1
  arr.sort((a, b) => {
    let cmp = 0
    switch (sortKey.value) {
      case 'strategy':
        cmp = a.strategy.localeCompare(b.strategy)
        break
      case 'best_annualized': {
        const av = Number.isFinite(a.best_annualized) ? a.best_annualized : -Infinity
        const bv = Number.isFinite(b.best_annualized) ? b.best_annualized : -Infinity
        cmp = av - bv
        break
      }
      case 'interval':
        cmp = `${a.start_date}~${a.end_date}`.localeCompare(`${b.start_date}~${b.end_date}`)
        break
      case 'completed_at':
        cmp = a.completed_at.localeCompare(b.completed_at)
        break
    }
    return cmp * dir
  })
  return arr
})

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value
  } else {
    sortKey.value = key
    // 数值/时间类默认降序，策略名/区间默认升序
    sortAsc.value = key === 'best_annualized' || key === 'completed_at' ? false : true
  }
}

function sortArrow(key: SortKey): string {
  if (sortKey.value !== key) return ''
  return sortAsc.value ? '▲' : '▼'
}

function groupKey(g: BacktestGroupRow): string {
  return `${g.strategy}|${g.start_date}|${g.end_date}`
}

function stripUsdt(symbol: string): string {
  return symbol.endsWith('USDT') ? symbol.slice(0, -4) : symbol
}

function formatCompletedAt(ts: string): string {
  if (!ts) return '-'
  // ISO 如 2026-06-30T07:48:57 或紧凑 20260630T074857
  const m = ts.match(/^(\d{4})-?(\d{2})-?(\d{2})[T\s]?(\d{2}):?(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`
  return ts
}

function fmtPct(v: number): string {
  if (!Number.isFinite(v)) return '-'
  return (v * 100).toFixed(1) + '%'
}

function pctClass(v: number): string {
  if (!Number.isFinite(v)) return ''
  return v > 0 ? 'val-positive' : v < 0 ? 'val-negative' : ''
}

function goTokenList(g: BacktestGroupRow) {
  router.push({
    name: 'BacktestTokenList',
    query: {
      strategy: g.strategy,
      start_date: g.start_date,
      end_date: g.end_date,
    },
  })
}

// 没有信号的空回测不展示（保留与原逻辑一致）
function hasSignals(result: BacktestResult): boolean {
  const sp = result.signals_processed
  return sp === undefined || sp > 0
}

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

onMounted(loadRows)

// dev 期间监听 vite 插件推送的索引更新事件，自动重新加载
if (import.meta.hot) {
  import.meta.hot.on('backtest-index-updated', () => {
    loadRows()
  })
}
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
  padding: 16px 20px;
  border-bottom: 1px solid #f0f0f0;
}

.filters {
  display: flex;
  align-items: center;
  gap: 16px;
}

.strategy-filter {
  width: 220px;
}

.row-count {
  font-size: 13px;
  color: #9ca3af;
}

.table-wrapper {
  overflow-x: auto;
}

.group-table {
  width: 100%;
  border-collapse: collapse;

  th,
  td {
    padding: 14px 16px;
    text-align: center;
    font-size: 14px;
    border-bottom: 1px solid #f3f4f6;
  }

  th {
    background: #f9fafb;
    font-weight: 600;
    color: #6b7280;
    font-size: 13px;
    letter-spacing: 0.5px;
    white-space: nowrap;
  }

  th.sortable {
    cursor: pointer;
    user-select: none;

    &:hover {
      color: #374151;
    }
  }

  .sort-arrow {
    font-size: 10px;
    margin-left: 4px;
    color: #9ca3af;
  }

  .col-name {
    text-align: left;
    font-weight: 600;
    color: #1f2937;
  }

  .col-tokens {
    text-align: left;
  }

  .col-time {
    font-variant-numeric: tabular-nums;
    color: #6b7280;
    font-size: 13px;
  }
}

.token-chip {
  display: inline-block;
  font-weight: 500;
  color: #374151;

  .sep {
    color: #d1d5db;
    margin: 0 4px;
    font-weight: 400;
  }
}

.more-btn {
  padding: 6px 16px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: #2563eb;
  }
}

.val-positive {
  color: #16a34a;
  font-weight: 600;
}

.val-negative {
  color: #dc2626;
  font-weight: 600;
}
</style>

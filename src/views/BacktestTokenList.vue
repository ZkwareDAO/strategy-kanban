<template>
  <div class="backtest-token-list">
    <button class="back-btn" @click="goBack">← 返回策略发现</button>

    <div class="page-header">
      <h2>{{ strategy }} <span class="interval">{{ startDate }} ~ {{ endDate }}</span></h2>
      <p>共 {{ tokenRows.length }} 个标的</p>
    </div>

    <div v-if="loading" class="state">加载中...</div>
    <div v-else-if="error" class="state error">{{ error }}</div>
    <div v-else-if="tokenRows.length === 0" class="state">该区间暂无回测数据</div>

    <div v-else class="table-wrapper">
      <table class="token-table">
        <thead>
          <tr>
            <th @click="toggleSort('symbol')">
              标的 <span class="sort-arrow">{{ sortArrow('symbol') }}</span>
            </th>
            <th @click="toggleSort('annualized_return')">
              年化 <span class="sort-arrow">{{ sortArrow('annualized_return') }}</span>
            </th>
            <th @click="toggleSort('roe')">
              ROE <span class="sort-arrow">{{ sortArrow('roe') }}</span>
            </th>
            <th @click="toggleSort('total_return')">
              总收益 <span class="sort-arrow">{{ sortArrow('total_return') }}</span>
            </th>
            <th @click="toggleSort('max_drawdown')">
              最大回撤 <span class="sort-arrow">{{ sortArrow('max_drawdown') }}</span>
            </th>
            <th @click="toggleSort('win_rate')">
              胜率 <span class="sort-arrow">{{ sortArrow('win_rate') }}</span>
            </th>
            <th @click="toggleSort('total_trades')">
              交易次数 <span class="sort-arrow">{{ sortArrow('total_trades') }}</span>
            </th>
            <th @click="toggleSort('sharpe_ratio')">
              夏普 <span class="sort-arrow">{{ sortArrow('sharpe_ratio') }}</span>
            </th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in sortedRows" :key="row.symbol">
            <td class="col-name">{{ formatSymbol(row.symbol) }}</td>
            <td :class="pctClass(row.annualized_return)">{{ fmtPct(row.annualized_return) }}</td>
            <td :class="pctClass(row.roe)">{{ fmtPct(row.roe) }}</td>
            <td :class="pctClass(row.total_return)">{{ fmtPct(row.total_return) }}</td>
            <td class="val-negative">{{ fmtPct(row.max_drawdown) }}</td>
            <td :class="winRateClass(row.win_rate)">{{ fmtPct(row.win_rate) }}</td>
            <td>{{ row.total_trades ?? '-' }}</td>
            <td>{{ fmtNum(row.sharpe_ratio) }}</td>
            <td>
              <button class="more-btn" @click="goDetail(row)">更多</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { dataRepository } from '@/data'
import { loadBacktestRuns } from '@/services/backtestRuns'
import { formatSymbol } from '@/utils/display'
import type { BacktestRunRow } from '@/models/dataset'

const route = useRoute()
const router = useRouter()

const strategy = (route.query.strategy as string) ?? ''
const startDate = (route.query.start_date as string) ?? ''
const endDate = (route.query.end_date as string) ?? ''
const day = (route.query.day as string) ?? ''
// 定位到具体批次：同一策略/区间可能跑过多次
const batch = (route.query.batch as string) ?? ''
const source = (route.query.source as string) ?? ''

interface TokenRow {
  symbol: string
  annualized_return: number | null
  roe: number | null
  total_return: number | null
  max_drawdown: number | null
  win_rate: number | null
  total_trades: number | null
  sharpe_ratio: number | null
  entry: BacktestRunRow
}

const loading = ref(true)
const error = ref('')
const tokenRows = ref<TokenRow[]>([])

type SortKey =
  | 'symbol'
  | 'annualized_return'
  | 'roe'
  | 'total_return'
  | 'max_drawdown'
  | 'win_rate'
  | 'total_trades'
  | 'sharpe_ratio'
const sortKey = ref<SortKey>('annualized_return')
const sortAsc = ref(false)

async function fetchData() {
  if (!strategy || !startDate || !endDate) {
    error.value = '缺少策略或回测区间参数'
    loading.value = false
    return
  }
  loading.value = true
  error.value = ''
  try {
    // discovery 走全局索引；replay/旧链接按天读取
    let rows: BacktestRunRow[]
    if (source === 'discovery' || !day) {
      const discovery = await dataRepository.getDiscoveryRuns()
      rows = discovery.length
        ? discovery
        : await loadBacktestRuns(await dataRepository.getCatalog(), { source: 'discovery' })
    } else {
      rows = await dataRepository.getDayRuns(day, { source: 'discovery' })
    }

    let matched = rows.filter(row => row.strategy === strategy && row.signalsProcessed !== 0)
    if (batch) {
      matched = matched.filter(row => row.batchId === batch)
    } else {
      // 旧链接：按区间匹配，并对每个标的只保留最新一次，避免重复成行
      matched = matched.filter(
        (row) =>
          (!startDate || row.startDate === startDate) &&
          (!endDate || row.endDate === endDate),
      )
      const latest = new Map<string, BacktestRunRow>()
      for (const row of matched) {
        const previous = latest.get(row.symbol)
        if (!previous || row.completedAt > previous.completedAt) latest.set(row.symbol, row)
      }
      matched = [...latest.values()]
    }

    tokenRows.value = matched.map(row => ({
      symbol: row.symbol,
      annualized_return: row.annualizedReturn,
      roe: row.roe,
      total_return: row.totalReturn,
      max_drawdown: row.maxDrawdown,
      win_rate: row.winRate,
      total_trades: row.totalTrades,
      sharpe_ratio: row.sharpeRatio,
      entry: row,
    }))
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

const sortedRows = computed(() => {
  const arr = [...tokenRows.value]
  const dir = sortAsc.value ? 1 : -1
  arr.sort((a, b) => {
    if (sortKey.value === 'symbol') {
      return a.symbol.localeCompare(b.symbol) * dir
    }
    const va = a[sortKey.value]
    const vb = b[sortKey.value]
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    return ((va as number) - (vb as number)) * dir
  })
  return arr
})

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value
  } else {
    sortKey.value = key
    sortAsc.value = key === 'symbol'
  }
}

function sortArrow(key: SortKey): string {
  if (sortKey.value !== key) return ''
  return sortAsc.value ? '▲' : '▼'
}

function fmtPct(v: number | null): string {
  if (v == null || Number.isNaN(v)) return '-'
  return (v * 100).toFixed(1) + '%'
}

function fmtNum(v: number | null): string {
  if (v == null || Number.isNaN(v)) return '-'
  return v.toFixed(2)
}

function pctClass(v: number | null): string {
  if (v == null) return ''
  return v > 0 ? 'val-positive' : v < 0 ? 'val-negative' : ''
}

function winRateClass(v: number | null): string {
  if (v == null) return ''
  return v >= 0.5 ? 'val-positive' : 'val-negative'
}

function goDetail(row: TokenRow) {
  router.push({
    name: 'BacktestDetail',
    params: { strategy: row.entry.strategy, symbol: row.entry.symbol },
    query: {
      day: row.entry.day,
      runStamp: row.entry.runStamp,
      source: 'discovery',
    },
  })
}

function goBack() {
  if (window.history.length > 1) {
    router.back()
    return
  }
  router.push({ path: '/', query: { tab: 'backtest' } })
}

onMounted(fetchData)
</script>

<style scoped lang="scss">
.backtest-token-list {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  box-sizing: border-box;
}

.back-btn {
  background: none;
  border: none;
  color: #3b82f6;
  font-size: 14px;
  cursor: pointer;
  padding: 8px 0;
  margin-bottom: 16px;

  &:hover {
    text-decoration: underline;
  }
}

.page-header {
  background: white;
  padding: 20px 24px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  margin-bottom: 20px;

  h2 {
    margin: 0 0 6px;
    font-size: 22px;
    color: #1a1a1a;
  }

  .interval {
    font-size: 15px;
    color: #6b7280;
    font-weight: 400;
    margin-left: 10px;
  }

  p {
    margin: 0;
    font-size: 14px;
    color: #6b7280;
  }
}

.state {
  padding: 40px;
  text-align: center;
  color: #6b7280;

  &.error {
    color: #dc2626;
  }
}

.table-wrapper {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  overflow-x: auto;
}

.token-table {
  width: 100%;
  border-collapse: collapse;

  th,
  td {
    padding: 14px 16px;
    text-align: center;
    font-size: 14px;
    border-bottom: 1px solid #f3f4f6;
    white-space: nowrap;
  }

  th {
    background: #f9fafb;
    font-weight: 600;
    color: #6b7280;
    font-size: 13px;
    letter-spacing: 0.5px;
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

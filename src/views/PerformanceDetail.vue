<template>
  <div class="performance-detail-page">
    <button class="back-btn" @click="goBack">← 返回策略表现</button>

    <div class="page-header">
      <h2>{{ strategyName }}</h2>
      <p v-if="dateFrom && dateTo">{{ dateFrom }} ~ {{ dateTo }}</p>
    </div>

    <div v-if="loading" class="state">加载中...</div>
    <div v-else-if="error" class="state error">{{ error }}</div>
    <div v-else-if="symbolList.length === 0" class="state">该策略暂无交易数据</div>

    <div v-else class="table-wrapper">
      <table class="perf-table">
        <thead>
          <tr>
            <th>代币</th>
            <th>总交易数</th>
            <th>盈利交易</th>
            <th>亏损交易</th>
            <th>胜率</th>
            <th>最大盈利</th>
            <th>最大亏损</th>
            <th>总盈亏</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in symbolList" :key="s.symbol">
            <td class="col-name">{{ s.symbol }}</td>
            <td>{{ s.total_trades }}</td>
            <td class="val-positive">{{ s.winning_trades }}</td>
            <td class="val-negative">{{ s.losing_trades }}</td>
            <td :class="winRateClass(s.win_rate)">{{ fmtPct(s.win_rate) }}</td>
            <td class="val-positive">{{ fmtPnl(s.max_profit) }}</td>
            <td class="val-negative">{{ fmtPnl(s.max_loss) }}</td>
            <td :class="pnlClass(s.total_pnl)">{{ fmtPnl(s.total_pnl) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getOrderPositions } from '@/api/performance'
import type { OrderPosition, SymbolPerformance } from '@/models/performance'

const props = defineProps<{
  strategyName: string
}>()

const route = useRoute()
const router = useRouter()
const dateFrom = route.query.from as string
const dateTo = route.query.to as string

const loading = ref(true)
const error = ref('')
const rawPositions = ref<OrderPosition[]>([])

function toRfc3339(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function dateToStartOfDay(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0))
}

function dateToEndOfDay(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59))
}

const symbolList = computed<SymbolPerformance[]>(() => {
  const closed = rawPositions.value.filter(p => p.deleted === 1 && p.pos_type === 2)
  const map = new Map<string, SymbolPerformance>()

  for (const p of closed) {
    const sym = p.asset
    const existing = map.get(sym)
    if (existing) {
      existing.total_trades += 1
      if (p.pnl_value > 0) existing.winning_trades += 1
      if (p.pnl_value < 0) existing.losing_trades += 1
      existing.total_pnl += p.pnl_value
      if (p.pnl_value > existing.max_profit) existing.max_profit = p.pnl_value
      if (p.pnl_value < existing.max_loss) existing.max_loss = p.pnl_value
    } else {
      map.set(sym, {
        symbol: sym,
        total_trades: 1,
        winning_trades: p.pnl_value > 0 ? 1 : 0,
        losing_trades: p.pnl_value < 0 ? 1 : 0,
        win_rate: 0,
        max_profit: p.pnl_value > 0 ? p.pnl_value : 0,
        max_loss: p.pnl_value < 0 ? p.pnl_value : 0,
        total_pnl: p.pnl_value,
      })
    }
  }

  for (const s of map.values()) {
    s.win_rate = s.total_trades > 0 ? s.winning_trades / s.total_trades : 0
  }

  return Array.from(map.values()).sort((a, b) => b.total_pnl - a.total_pnl)
})

async function fetchData() {
  if (!dateFrom || !dateTo) {
    loading.value = false
    return
  }
  loading.value = true
  error.value = ''
  try {
    const from = toRfc3339(dateToStartOfDay(dateFrom))
    const to = toRfc3339(dateToEndOfDay(dateTo))
    const allPositions = await getOrderPositions(from, to)
    // 匹配策略组：strategy_name 以策略组名开头（如 DOLPHINV2_4H_2_DOGEUSDT 匹配 DOLPHINV2_4H_2）
    rawPositions.value = allPositions.filter(p => {
      if (p.strategy_name === props.strategyName) return true
      return p.strategy_name.startsWith(props.strategyName + '_')
    })
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

function fmtPct(v: number): string {
  if (Number.isNaN(v)) return '-'
  return (v * 100).toFixed(1) + '%'
}

function fmtPnl(v: number): string {
  if (Number.isNaN(v)) return '-'
  return v.toFixed(4)
}

function winRateClass(v: number): string {
  return v >= 0.5 ? 'val-positive' : 'val-negative'
}

function pnlClass(v: number): string {
  return v > 0 ? 'val-positive' : v < 0 ? 'val-negative' : ''
}

function goBack() {
  // 来源 tab 由 query.from_tab 指定（默认 performance），
  // 从首页"实盘表现"进入时会带 from_tab=strategy，返回到对应 tab
  const fromTab = (route.query.from_tab as string) || 'performance'
  router.push({ path: '/', query: { tab: fromTab } })
}

onMounted(fetchData)
</script>

<style scoped lang="scss">
.performance-detail-page {
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

.perf-table {
  width: 100%;
  border-collapse: collapse;

  th, td {
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
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .col-name {
    text-align: left;
    font-weight: 600;
    color: #1f2937;
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

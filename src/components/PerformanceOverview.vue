<template>
  <div class="performance-overview">
    <!-- 日期范围选择 -->
    <div class="toolbar">
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        range-separator="至"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        format="YYYY-MM-DD"
        value-format="YYYY-MM-DD"
        @change="handleDateChange"
      />
      <span class="row-count">{{ strategyList.length }} 条策略</span>
    </div>

    <div v-if="loading" class="state">加载中...</div>
    <div v-else-if="error" class="state error">{{ error }}</div>
    <div v-else-if="strategyList.length === 0" class="state">暂无策略表现数据</div>

    <!-- 策略表现表格 -->
    <div v-else class="table-wrapper">
      <table class="perf-table">
        <thead>
          <tr>
            <th>策略名称</th>
            <th>总交易数</th>
            <th>盈利交易</th>
            <th>亏损交易</th>
            <th>胜率</th>
            <th>总盈亏</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in strategyList" :key="s.strategy_name">
            <td class="col-name">{{ s.strategy_name }}</td>
            <td>{{ s.total_trades }}</td>
            <td class="val-positive">{{ s.winning_trades }}</td>
            <td class="val-negative">{{ s.losing_trades }}</td>
            <td :class="winRateClass(s.win_rate)">{{ fmtPct(s.win_rate) }}</td>
            <td :class="pnlClass(s.total_pnl)">{{ fmtPnl(s.total_pnl) }}</td>
            <td>
              <button class="detail-btn" @click="goDetail(s.strategy_name)">详情</button>
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
import { getOrderPositions } from '@/api/performance'
import type { OrderPosition, StrategyPerformance } from '@/models/performance'

const router = useRouter()

const loading = ref(false)
const error = ref('')
const rawPositions = ref<OrderPosition[]>([])

// 默认日期范围：上周一 ~ 今天
function getLastMonday(): Date {
  const now = new Date()
  const day = now.getDay() // 0=Sun
  const diff = day === 0 ? 6 : day - 1
  const monday = new Date(now)
  monday.setDate(now.getDate() - diff - 7) // 上周一
  monday.setHours(0, 0, 0, 0)
  return monday
}

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

const lastMonday = getLastMonday()
const today = new Date()
today.setHours(23, 59, 59, 0)

const dateRange = ref<[string, string]>([
  lastMonday.toISOString().slice(0, 10),
  today.toISOString().slice(0, 10),
])

// 聚合策略维度数据
const strategyList = computed<StrategyPerformance[]>(() => {
  // 只统计已平仓的期货交易 (deleted=1, pos_type=2)
  const closed = rawPositions.value.filter(p => p.deleted === 1 && p.pos_type === 2)
  const map = new Map<string, StrategyPerformance>()

  for (const p of closed) {
    const name = p.strategy_name
    const existing = map.get(name)
    if (existing) {
      existing.total_trades += 1
      if (p.pnl_value > 0) existing.winning_trades += 1
      if (p.pnl_value < 0) existing.losing_trades += 1
      existing.total_pnl += p.pnl_value
    } else {
      map.set(name, {
        strategy_name: name,
        total_trades: 1,
        winning_trades: p.pnl_value > 0 ? 1 : 0,
        losing_trades: p.pnl_value < 0 ? 1 : 0,
        win_rate: 0,
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
  if (!dateRange.value || dateRange.value.length !== 2) return
  loading.value = true
  error.value = ''
  try {
    const from = toRfc3339(dateToStartOfDay(dateRange.value[0]))
    const to = toRfc3339(dateToEndOfDay(dateRange.value[1]))
    rawPositions.value = await getOrderPositions(from, to)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

function handleDateChange() {
  fetchData()
}

function goDetail(strategyName: string) {
  router.push({
    name: 'PerformanceDetail',
    params: { strategyName },
    query: {
      from: dateRange.value?.[0] ?? '',
      to: dateRange.value?.[1] ?? '',
    },
  })
}

// ---- Formatting ----
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

onMounted(fetchData)
</script>

<style scoped lang="scss">
.performance-overview {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid #f0f0f0;
}

.row-count {
  font-size: 13px;
  color: #9ca3af;
}

.state {
  padding: 48px;
  text-align: center;
  color: #6b7280;

  &.error {
    color: #dc2626;
  }
}

.table-wrapper {
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

.detail-btn {
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

<template>
  <div class="strategy-overview">
    <!-- Header -->
    <div class="header">
      <h1>交易复盘系统</h1>
    </div>

    <!-- 模式切换 -->
    <el-tabs v-model="activeTab" class="mode-tabs">
      <el-tab-pane label="实盘表现" name="strategy" />
      <el-tab-pane label="回测详情" name="backtest" />
      <el-tab-pane label="策略表现" name="performance" />
    </el-tabs>

    <!-- 回测详情 -->
    <backtest-overview v-if="activeTab === 'backtest'" />

    <!-- 策略表现 -->
    <performance-overview v-else-if="activeTab === 'performance'" />

    <!-- 策略表格 -->
    <template v-else>
      <div v-if="strategyStore.loading" class="loading">加载中...</div>
      <strategy-list
        v-else
        :summaries="strategyStore.strategySummaries"
        :runtimes="strategyStore.runtimes"
        :positions="strategyStore.positions"
        :performances="performanceMap"
        :selected-date="selectedDate"
        @view-position="handleViewPosition"
        @view-performance="handleViewPerformance"
        @date-change="handleDateChange"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useStrategyStore } from '@/stores/strategy'
import { useAppStore } from '@/stores/app'
import { getOrderPositions } from '@/api/performance'
import type { StrategyPerformance, OrderPosition } from '@/models/performance'
import StrategyList from '@/components/strategy/StrategyList.vue'
import BacktestOverview from '@/components/BacktestOverview.vue'
import PerformanceOverview from '@/components/PerformanceOverview.vue'

const router = useRouter()
const route = useRoute()
const strategyStore = useStrategyStore()
const appStore = useAppStore()

const selectedDate = ref('')
const activeTab = ref<'strategy' | 'backtest' | 'performance'>('strategy')
const orderPositions = ref<OrderPosition[]>([])

/** 按策略目录名聚合的绩效数据（key = dir_name，如 DOLPHINV2_4H_2） */
const performanceMap = computed<Record<string, StrategyPerformance>>(() => {
  const map = new Map<string, StrategyPerformance>()
  for (const p of orderPositions.value) {
    if (p.deleted !== 1 || p.pos_type !== 2) continue
    // strategy_name 格式 {dir_name}_{SYMBOL}，去掉最后一段得到 dir_name
    const idx = p.strategy_name.lastIndexOf('_')
    const dirName = idx > 0 ? p.strategy_name.slice(0, idx) : p.strategy_name
    let perf = map.get(dirName)
    if (!perf) {
      perf = { strategy_name: dirName, total_trades: 0, winning_trades: 0, losing_trades: 0, win_rate: 0, total_pnl: 0 }
      map.set(dirName, perf)
    }
    perf.total_trades++
    if (p.pnl_value > 0) perf.winning_trades++
    else if (p.pnl_value < 0) perf.losing_trades++
    perf.total_pnl += p.pnl_value
  }
  for (const perf of map.values()) {
    perf.win_rate = perf.total_trades > 0 ? perf.winning_trades / perf.total_trades : 0
  }
  return Object.fromEntries(map)
})

async function loadPerformance(date: string) {
  // 取当天的 RFC3339 区间
  const y = date.slice(0, 4)
  const m = date.slice(4, 6)
  const d = date.slice(6, 8)
  const from = `${y}-${m}-${d}T00:00:00Z`
  const to = `${y}-${m}-${d}T23:59:59Z`
  orderPositions.value = await getOrderPositions(from, to)
}

async function handleDateChange(date: string) {
  selectedDate.value = date
  appStore.setDate(date)
  await Promise.all([
    strategyStore.fetchRuntimes(date),
    loadPerformance(date),
  ])
}

function handleViewPosition(runtimeName: string, symbol: string) {
  const runtime = strategyStore.runtimes.find(r => r.runtime_name === runtimeName)
  if (runtime) {
    router.push({
      name: 'TokenDetailV2',
      params: {
        strategy: runtime.strategy,
        symbol: symbol,
      },
      query: {
        runtime: runtime.runtime_name,
        dir: runtime.dir_name,
        date: appStore.date,
      },
    })
  }
}

function handleViewPerformance(sourceStrategy: string) {
  // 找到该 source_strategy 对应的 dir_name，传给 PerformanceDetail
  const runtime = strategyStore.runtimes.find(r => r.strategy === sourceStrategy)
  const dirName = runtime?.dir_name ?? sourceStrategy
  router.push({
    name: 'PerformanceDetail',
    params: { strategyName: dirName },
    query: {
      from: selectedDate.value.slice(0, 4) + '-' + selectedDate.value.slice(4, 6) + '-' + selectedDate.value.slice(6, 8),
      to: selectedDate.value.slice(0, 4) + '-' + selectedDate.value.slice(4, 6) + '-' + selectedDate.value.slice(6, 8),
      from_tab: 'strategy',
    },
  })
}

onMounted(async () => {
  // 从详情页返回时，通过 query.tab 恢复到对应 tab
  const tabParam = route.query.tab as string
  if (tabParam === 'backtest' || tabParam === 'performance') {
    activeTab.value = tabParam
  }

  // 如果 appStore 已经有日期（从详情页返回），使用之前选择的日期
  // 否则默认选择昨天的日期
  if (appStore.date) {
    selectedDate.value = appStore.date
    await Promise.all([
      strategyStore.fetchRuntimes(appStore.date),
      loadPerformance(appStore.date),
    ])
  } else {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const defaultDate = yesterday.toISOString().slice(0, 10).replace(/-/g, '')
    selectedDate.value = defaultDate
    await handleDateChange(defaultDate)
  }
})
</script>

<style scoped lang="scss">
.strategy-overview {
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
  box-sizing: border-box;
}

.header {
  background: white;
  padding: 20px 30px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  margin-bottom: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;

  h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 700;
    color: #1a1a1a;
    letter-spacing: 1px;
  }
}

.mode-tabs {
  background: white;
  padding: 0 20px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  margin-bottom: 20px;
}

.loading {
  text-align: center;
  padding: 40px;
  font-size: 16px;
  color: #6b7280;
}
</style>

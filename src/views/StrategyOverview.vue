<template>
  <div class="strategy-overview">
    <!-- Header -->
    <div class="header">
      <h1>交易复盘系统</h1>
      <div class="date-picker">
        <label>日期:</label>
        <el-date-picker
          v-model="selectedDate"
          type="date"
          placeholder="选择日期"
          format="YYYY-MM-DD"
          value-format="YYYYMMDD"
          @change="handleDateChange"
        />
      </div>
    </div>

    <!-- Mode Selector -->
    <mode-selector
      :model-value="selectedMode"
      :counts="strategyStore.modeCounts"
      @update:model-value="handleModeChange"
    />

    <!-- Strategy List -->
    <strategy-list
      :summaries="strategyStore.strategySummaries"
      :expanded-strategy="expandedStrategy ?? undefined"
      @expand="handleExpand"
    >
      <template #default>
        <position-table
          v-if="positionsForStrategy.length > 0"
          :positions="positionsForStrategy"
          :show-symbol="true"
          :symbols="symbolsForStrategy"
          @view="handleViewPosition"
        />
      </template>
    </strategy-list>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useStrategyStore } from '@/stores/strategy'
import { useAppStore } from '@/stores/app'
import ModeSelector from '@/components/strategy/ModeSelector.vue'
import StrategyList from '@/components/strategy/StrategyList.vue'
import PositionTable from '@/components/strategy/PositionTable.vue'
import type { Position } from '@/models/position'

const router = useRouter()
const strategyStore = useStrategyStore()
const appStore = useAppStore()

const selectedDate = ref('')
const selectedMode = ref<'live' | 'paper_trading' | 'smoking'>('live')
const expandedStrategy = ref<string | null>(null)

// 同步 selectedMode 到 store，使 filteredRuntimes 生效
function handleModeChange(mode: 'live' | 'paper_trading' | 'smoking') {
  selectedMode.value = mode
  strategyStore.setMode(mode)
  expandedStrategy.value = null
}

const positionsForStrategy = computed((): Position[] => {
  if (!expandedStrategy.value) return []
  const runtimes = strategyStore.filteredRuntimes.filter(r => r.strategy === expandedStrategy.value)
  const allPositions: Position[] = []
  for (const runtime of runtimes) {
    const positions = strategyStore.positions[runtime.runtime_name]
    if (positions && positions.length > 0) {
      allPositions.push(...positions)
    }
  }
  return allPositions
})

const symbolsForStrategy = computed((): string[] => {
  if (!expandedStrategy.value) return []
  const runtimes = strategyStore.filteredRuntimes.filter(r => r.strategy === expandedStrategy.value)
  const symbols: string[] = []
  for (const runtime of runtimes) {
    const positions = strategyStore.positions[runtime.runtime_name]
    if (positions && positions.length > 0) {
      for (const _ of positions) {
        symbols.push(runtime.symbol)
      }
    }
  }
  return symbols
})

async function handleDateChange(date: string) {
  appStore.setDate(date)
  await strategyStore.fetchRuntimes(date)
  expandedStrategy.value = null
}

async function handleExpand(strategy: string) {
  if (expandedStrategy.value === strategy) {
    expandedStrategy.value = null
    return
  }

  expandedStrategy.value = strategy
  const runtimes = strategyStore.filteredRuntimes.filter(r => r.strategy === strategy)
  for (const runtime of runtimes) {
    if (!strategyStore.fetchedRuntimes.has(runtime.runtime_name)) {
      await strategyStore.fetchPositions(runtime.runtime_name, appStore.date)
    }
  }
}

function handleViewPosition(position: Position) {
  const runtime = strategyStore.filteredRuntimes.find(r =>
    strategyStore.positions[r.runtime_name]?.some(p => p.position_id === position.position_id)
  )
  if (runtime) {
    router.push({
      name: 'TokenDetail',
      params: {
        strategy: runtime.strategy,
        symbol: runtime.symbol,
      },
      query: {
        runtime: runtime.runtime_name,
        date: appStore.date,
      },
    })
  }
}

onMounted(async () => {
  const defaultDate = '20260720'
  selectedDate.value = defaultDate
  await handleDateChange(defaultDate)
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

.date-picker {
  display: flex;
  gap: 10px;
  align-items: center;

  label {
    font-size: 14px;
    color: #6b7280;
  }
}
</style>
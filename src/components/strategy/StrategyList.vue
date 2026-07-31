<template>
  <div class="strategy-list">
    <!-- Header -->
    <div class="strategy-header">
      <div class="col-name">策略名称</div>
      <div class="col-tokens">代币</div>
      <div class="col-mode">模式</div>
    </div>

    <!-- Strategy Rows -->
    <div v-if="summaries.length > 0">
      <div
        v-for="summary in summaries"
        :key="summary.strategy"
        class="strategy-row"
      >
        <div class="col-name">{{ summary.display_name || summary.strategy }}</div>
        <div class="col-tokens">
          <token-display
            :tokens="getTokenInfoForStrategy(summary.strategy)"
            @click="(token) => $emit('view-position', getRuntimeName(summary.strategy, token), token)"
          />
        </div>
        <div class="col-mode">
          <span
            v-for="mode in getModesForStrategy(summary.strategy)"
            :key="mode"
            class="mode-tag"
            :class="`mode-${mode}`"
          >
            {{ formatMode(mode) }}
          </span>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">暂无策略数据</div>
  </div>
</template>

<script setup lang="ts">
import type { StrategySummary, Runtime, TradingMode } from '@/models/runtime'
import type { Position } from '@/models/position'
import TokenDisplay from './TokenDisplay.vue'

const props = defineProps<{
  summaries: StrategySummary[]
  runtimes: Runtime[]
  positions: Record<string, Position[]>
}>()

defineEmits<{
  'view-position': [runtimeName: string, symbol: string]
}>()

// 获取策略对应的所有代币及其交易模式（包括无仓位的）
function getTokenInfoForStrategy(strategy: string): { token: string; mode: TradingMode; hasData: boolean }[] {
  const strategyRuntimes = props.runtimes.filter(r => r.strategy === strategy)
  const tokenMap = new Map<string, { mode: TradingMode; hasData: boolean }>()

  for (const runtime of strategyRuntimes) {
    const hasPositions = !!(props.positions[runtime.runtime_name]?.length)
    const existing = tokenMap.get(runtime.symbol)
    // 如果已有且任一 runtime 有仓位，则标记为有数据
    if (existing) {
      if (hasPositions) existing.hasData = true
    } else {
      tokenMap.set(runtime.symbol, { mode: runtime.trading_mode, hasData: hasPositions || runtime.has_data })
    }
  }

  return Array.from(tokenMap.entries())
    .map(([token, info]) => ({ token, mode: info.mode, hasData: info.hasData }))
    .sort((a, b) => {
      // 有数据的排前面
      if (a.hasData !== b.hasData) return a.hasData ? -1 : 1
      return a.token.localeCompare(b.token)
    })
}

// 获取策略对应的所有模式（包括无仓位的）
function getModesForStrategy(strategy: string): TradingMode[] {
  const strategyRuntimes = props.runtimes.filter(r => r.strategy === strategy)
  const modes = new Set<TradingMode>()

  for (const runtime of strategyRuntimes) {
    modes.add(runtime.trading_mode)
  }

  return Array.from(modes)
}

// 获取运行实例名称
function getRuntimeName(strategy: string, symbol: string): string {
  const runtime = props.runtimes.find(r =>
    r.strategy === strategy && r.symbol === symbol
  )
  return runtime?.runtime_name ?? ''
}

// 格式化模式显示
function formatMode(mode: TradingMode): string {
  const modeMap: Record<TradingMode, string> = {
    live: 'Live',
    paper_trading: 'Paper',
    smoking: 'Smoking'
  }
  return modeMap[mode]
}
</script>

<style scoped lang="scss">
.strategy-list {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.strategy-header {
  background: #f9fafb;
  padding: 15px 20px;
  border-bottom: 1px solid #e5e7eb;
  font-weight: 600;
  display: grid;
  grid-template-columns: 1fr 2fr 1fr;
  gap: 20px;
  font-size: 14px;
  color: #6b7280;
}

.strategy-row {
  padding: 20px;
  display: grid;
  grid-template-columns: 1fr 2fr 1fr;
  gap: 20px;
  align-items: center;
  border-bottom: 1px solid #e5e7eb;
  transition: background 0.2s;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: #f9fafb;
  }
}

.col-name {
  font-weight: 600;
  font-size: 15px;
}

.col-tokens {
  display: flex;
  align-items: center;
}

.col-mode {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.mode-tag {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.mode-live {
  background: #fee2e2;
  color: #dc2626;
}

.mode-paper_trading {
  background: #fef3c7;
  color: #d97706;
}

.mode-smoking {
  background: #e0e7ff;
  color: #4f46e5;
}

.empty-state {
  padding: 40px;
  text-align: center;
  color: #6b7280;
}
</style>
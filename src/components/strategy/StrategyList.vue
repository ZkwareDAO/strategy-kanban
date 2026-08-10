<template>
  <div class="strategy-list">
    <!-- Toolbar: 日期选择 -->
    <div class="toolbar">
      <el-date-picker
        :model-value="selectedDate"
        type="date"
        placeholder="选择日期"
        format="YYYY-MM-DD"
        value-format="YYYYMMDD"
        @update:model-value="$emit('date-change', $event)"
      />
      <span class="row-count">{{ summaries.length }} 条策略</span>
    </div>

    <!-- Header -->
    <div class="strategy-header">
      <div class="col-name">策略名称</div>
      <div class="col-perf">表现</div>
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
        <div class="col-perf">
          <template v-if="getPerformance(summary.strategy)">
            <div class="perf-stats">
              <span class="perf-item">总交易 <b>{{ getPerformance(summary.strategy)!.total_trades }}</b></span>
              <span class="perf-item pos">盈 <b>{{ getPerformance(summary.strategy)!.winning_trades }}</b></span>
              <span class="perf-item neg">亏 <b>{{ getPerformance(summary.strategy)!.losing_trades }}</b></span>
              <span class="perf-item" :class="winRateClass(getPerformance(summary.strategy)!.win_rate)">
                胜率 <b>{{ (getPerformance(summary.strategy)!.win_rate * 100).toFixed(1) }}%</b>
              </span>
              <span class="perf-item" :class="pnlClass(getPerformance(summary.strategy)!.total_pnl)">
                盈亏 <b>{{ getPerformance(summary.strategy)!.total_pnl.toFixed(4) }}</b>
              </span>
              <button class="detail-btn" @click="$emit('view-performance', summary.strategy)">详情</button>
            </div>
          </template>
          <span v-else class="perf-empty">—</span>
        </div>
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
import type { StrategyPerformance } from '@/models/performance'
import TokenDisplay from './TokenDisplay.vue'

const props = defineProps<{
  summaries: StrategySummary[]
  runtimes: Runtime[]
  positions: Record<string, Position[]>
  selectedDate: string
  performances?: Record<string, StrategyPerformance>
}>()

const emit = defineEmits<{
  'view-position': [runtimeName: string, symbol: string]
  'view-performance': [strategyName: string]
  'date-change': [date: string]
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
      tokenMap.set(runtime.symbol, { mode: runtime.trading_mode, hasData: hasPositions })
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
    live: 'Product',
    paper_trading: 'Paper',
    smoking: 'Smoking',
    unknown: 'Unknown',
  }
  return modeMap[mode]
}

// 绩效数据的 strategy_name 是 {dir_name}_{SYMBOL} 去掉SYMBOL后的 dir_name，
// 需通过 runtimes 找到该 source_strategy 对应的 dir_name 来查找
function getPerformance(sourceStrategy: string): StrategyPerformance | undefined {
  if (!props.performances) return undefined
  const runtimes = props.runtimes.filter(r => r.strategy === sourceStrategy)
  for (const r of runtimes) {
    const perf = props.performances[r.dir_name]
    if (perf) return perf
  }
  return undefined
}

function winRateClass(rate: number): string {
  return rate >= 0.5 ? 'pos' : 'neg'
}

function pnlClass(pnl: number): string {
  return pnl > 0 ? 'pos' : pnl < 0 ? 'neg' : ''
}
</script>

<style scoped lang="scss">
.strategy-list {
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

.strategy-header {
  background: #f9fafb;
  padding: 15px 20px;
  border-bottom: 1px solid #e5e7eb;
  font-weight: 600;
  display: grid;
  grid-template-columns: 1fr 2.5fr 1.5fr 1fr;
  gap: 16px;
  font-size: 14px;
  color: #6b7280;
}

.strategy-row {
  padding: 16px 20px;
  display: grid;
  grid-template-columns: 1fr 2.5fr 1.5fr 1fr;
  gap: 16px;
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

.col-perf {
  display: flex;
  align-items: center;
}

.perf-stats {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 12px;
  color: #6b7280;
}

.perf-item b {
  color: #1f2937;
  font-weight: 600;
}

.perf-item.pos b { color: #16a34a; }
.perf-item.neg b { color: #dc2626; }

.perf-empty {
  color: #d1d5db;
}

.detail-btn {
  padding: 3px 10px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: #2563eb;
  }
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

.mode-unknown {
  background: #f3f4f6;
  color: #6b7280;
}

.empty-state {
  padding: 40px;
  text-align: center;
  color: #6b7280;
}
</style>
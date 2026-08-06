<template>
  <div class="comparison-section">
    <h3 class="section-title">实盘与回放信号对比</h3>

    <!-- Summary Cards -->
    <div class="comparison-summary">
      <div class="comparison-metric">
        <label>实盘信号数</label>
        <div class="value">{{ comparison?.total_live ?? 0 }}</div>
      </div>
      <div class="comparison-metric">
        <label>回放信号数</label>
        <div class="value">{{ comparison?.total_backtest ?? 0 }}</div>
      </div>
      <div class="comparison-metric">
        <label>匹配数</label>
        <div class="value">{{ comparison?.matched ?? 0 }}</div>
      </div>
      <div class="comparison-metric">
        <label>准确率</label>
        <div class="value">{{ accuracyPercent }}</div>
      </div>
    </div>

    <!-- Signal Tabs -->
    <div class="signal-tabs">
      <button
        :class="['tab-btn', { active: activeTab === 'all' }]"
        @click="activeTab = 'all'"
      >
        全部信号
      </button>
      <button
        :class="['tab-btn', { active: activeTab === 'live' }]"
        @click="activeTab = 'live'"
      >
        实盘信号
      </button>
      <button
        :class="['tab-btn', { active: activeTab === 'backtest' }]"
        @click="activeTab = 'backtest'"
      >
        回放信号
      </button>
      <button
        :class="['tab-btn', { active: activeTab === 'unique' }]"
        @click="activeTab = 'unique'"
      >
        独有信号
      </button>
    </div>

    <!-- Signal Lists -->
    <div class="signal-content">
      <!-- 全部信号 -->
      <template v-if="activeTab === 'all'">
        <div v-if="comparison?.matched_signals?.length" class="signal-section">
          <h4>匹配信号 ({{ comparison.matched_signals.length }}):</h4>
          <div class="signal-list">
            <div
              v-for="sig in comparison.matched_signals"
              :key="sig.signal_id || sig.live_signal_id"
              class="signal-item matched"
              :class="sig.side"
            >
              <div class="signal-id">{{ sig.signal_id || sig.live_signal_id }}</div>
              <div class="signal-info">
                {{ formatTimeUtc8(sig) }} {{ signalLabel(sig) }} |
                实盘: ${{ (sig.live_price || sig.price || 0).toLocaleString() }} |
                回放: ${{ (sig.backtest_price || sig.price || 0).toLocaleString() }}
              </div>
              <div v-if="sig.time_diff_seconds" class="signal-detail">
                时间差: {{ sig.time_diff_seconds }}s
              </div>
              <div v-if="sig.price_diff_pct" class="signal-detail">
                价差: {{ sig.price_diff_pct.toFixed(2) }}%
              </div>
            </div>
          </div>
        </div>

        <div v-if="comparison?.unmatched_live?.length" class="signal-section">
          <h4>实盘独有信号 ({{ comparison.unmatched_live.length }}):</h4>
          <div class="signal-list">
            <div
              v-for="sig in comparison.unmatched_live"
              :key="sig.signal_id || sig.live_signal_id"
              class="signal-item live-only"
              :class="sig.side"
            >
              <div class="signal-id">{{ sig.signal_id || sig.live_signal_id }}</div>
              <div class="signal-info">{{ formatTimeUtc8(sig) }} {{ signalLabel(sig) }} | ${{ (sig.live_price || sig.price || 0).toLocaleString() }}</div>
              <div v-if="sig.reason" class="signal-reason">{{ sig.reason }}</div>
            </div>
          </div>
        </div>

        <div v-if="comparison?.unmatched_backtest?.length" class="signal-section">
          <h4>回放独有信号 ({{ comparison.unmatched_backtest.length }}):</h4>
          <div class="signal-list">
            <div
              v-for="sig in comparison.unmatched_backtest"
              :key="sig.signal_id || sig.backtest_signal_id"
              class="signal-item backtest-only"
              :class="sig.side"
            >
              <div class="signal-id">{{ sig.signal_id || sig.backtest_signal_id }}</div>
              <div class="signal-info">{{ formatTimeUtc8(sig) }} {{ signalLabel(sig) }} | ${{ (sig.backtest_price || sig.price || 0).toLocaleString() }}</div>
              <div v-if="sig.reason" class="signal-reason">{{ sig.reason }}</div>
            </div>
          </div>
        </div>
      </template>

      <!-- 实盘信号 -->
      <template v-else-if="activeTab === 'live'">
        <div v-if="allLiveSignals.length" class="signal-section">
          <h4>实盘信号 ({{ allLiveSignals.length }}):</h4>
          <div class="signal-list">
            <div
              v-for="sig in allLiveSignals"
              :key="sig.signal_id || sig.live_signal_id"
              class="signal-item live"
              :class="sig.side"
            >
              <div class="signal-id">{{ sig.signal_id || sig.live_signal_id }}</div>
              <div class="signal-info">{{ formatTimeUtc8(sig) }} {{ signalLabel(sig) }} | ${{ (sig.live_price || sig.price || 0).toLocaleString() }}</div>
              <div v-if="sig.match_type" class="signal-badge matched">已匹配</div>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">无实盘信号</div>
      </template>

      <!-- 回放信号 -->
      <template v-else-if="activeTab === 'backtest'">
        <div v-if="allBacktestSignals.length" class="signal-section">
          <h4>回放信号 ({{ allBacktestSignals.length }}):</h4>
          <div class="signal-list">
            <div
              v-for="sig in allBacktestSignals"
              :key="sig.signal_id || sig.backtest_signal_id"
              class="signal-item backtest"
              :class="sig.side"
            >
              <div class="signal-id">{{ sig.signal_id || sig.backtest_signal_id }}</div>
              <div class="signal-info">{{ formatTimeUtc8(sig) }} {{ signalLabel(sig) }} | ${{ (sig.backtest_price || sig.price || 0).toLocaleString() }}</div>
              <div v-if="sig.match_type" class="signal-badge matched">已匹配</div>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">无回放信号</div>
      </template>

      <!-- 独有信号 -->
      <template v-else-if="activeTab === 'unique'">
        <div v-if="comparison?.unmatched_live?.length" class="signal-section">
          <h4>实盘独有信号 ({{ comparison.unmatched_live.length }}):</h4>
          <div class="signal-list">
            <div
              v-for="sig in comparison.unmatched_live"
              :key="sig.signal_id || sig.live_signal_id"
              class="signal-item live-only"
              :class="sig.side"
            >
              <div class="signal-id">{{ sig.signal_id || sig.live_signal_id }}</div>
              <div class="signal-info">{{ formatTimeUtc8(sig) }} {{ signalLabel(sig) }} | ${{ (sig.live_price || sig.price || 0).toLocaleString() }}</div>
              <div v-if="sig.reason" class="signal-reason">{{ sig.reason }}</div>
            </div>
          </div>
        </div>

        <div v-if="comparison?.unmatched_backtest?.length" class="signal-section">
          <h4>回放独有信号 ({{ comparison.unmatched_backtest.length }}):</h4>
          <div class="signal-list">
            <div
              v-for="sig in comparison.unmatched_backtest"
              :key="sig.signal_id || sig.backtest_signal_id"
              class="signal-item backtest-only"
              :class="sig.side"
            >
              <div class="signal-id">{{ sig.signal_id || sig.backtest_signal_id }}</div>
              <div class="signal-info">{{ formatTimeUtc8(sig) }} {{ signalLabel(sig) }} | ${{ (sig.backtest_price || sig.price || 0).toLocaleString() }}</div>
              <div v-if="sig.reason" class="signal-reason">{{ sig.reason }}</div>
            </div>
          </div>
        </div>

        <div v-if="!comparison?.unmatched_live?.length && !comparison?.unmatched_backtest?.length" class="empty-state">
          无独有信号
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { SignalComparison, Signal } from '@/models/detail'

const props = defineProps<{
  comparison?: SignalComparison
}>()

const activeTab = ref<'all' | 'live' | 'backtest' | 'unique'>('all')

/**
 * 根据 action 显示正确的方向：buy=开多 sell=开空 sell_close=平多 buy_close=平空。
 * action 缺失时回退到 side。注意 side 不可直接用于显示方向，只有 action 是权威字段。
 */
function signalLabel(sig: Signal): string {
  switch (sig.action) {
    case 'buy': return '开多'
    case 'sell': return '开空'
    case 'sell_close': return '平多'
    case 'buy_close': return '平空'
    default:
      return sig.side === 'buy' ? '开多' : '开空'
  }
}

/**
 * 将信号时间转为 UTC+8 显示（仅影响显示，不改原始数据）。
 * 如 2026-08-04T18:30:00+00:00 → 2026-08-05 02:30:00
 */
function formatTimeUtc8(sig: Signal): string {
  const raw = sig.timestamp || sig.time || ''
  if (!raw) return ''
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  d.setUTCHours(d.getUTCHours() + 8)
  return d.toISOString().replace('T', ' ').slice(0, 19)
}

const accuracyPercent = computed(() => {
  if (!props.comparison) return '0%'
  return `${(props.comparison.accuracy_score * 100).toFixed(0)}%`
})

// 所有实盘信号（匹配 + 独有）
const allLiveSignals = computed(() => {
  if (!props.comparison) return []
  const matched = (props.comparison.matched_signals || []).map(s => ({ ...s, match_type: 'matched' }))
  const unmatched = props.comparison.unmatched_live || []
  return [...matched, ...unmatched]
})

// 所有回放信号（匹配 + 独有）
const allBacktestSignals = computed(() => {
  if (!props.comparison) return []
  const matched = (props.comparison.matched_signals || []).map(s => ({ ...s, match_type: 'matched' }))
  const unmatched = props.comparison.unmatched_backtest || []
  return [...matched, ...unmatched]
})
</script>

<style scoped lang="scss">
.comparison-section {
  background: white;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  margin-top: 20px;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 20px 0;
}

.comparison-summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 15px;
  margin-bottom: 20px;
}

.comparison-metric {
  text-align: center;
  padding: 15px;
  background: #f9fafb;
  border-radius: 8px;

  label {
    display: block;
    font-size: 13px;
    color: #6b7280;
    margin-bottom: 5px;
  }

  .value {
    font-size: 24px;
    font-weight: 600;
  }
}

.signal-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  border-bottom: 2px solid #e5e7eb;
  padding-bottom: 10px;
}

.tab-btn {
  padding: 8px 16px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 6px 6px 0 0;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
  margin-bottom: -12px;

  &:hover {
    background: #f9fafb;
  }

  &.active {
    background: #3b82f6;
    color: white;
    border-color: #3b82f6;
  }
}

.signal-content {
  min-height: 200px;
}

.signal-section {
  margin-top: 15px;

  h4 {
    margin: 0 0 10px 0;
    font-size: 14px;
  }
}

.signal-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.signal-item {
  background: #f9fafb;
  padding: 12px 15px;
  border-radius: 8px;
  border-left: 3px solid #3b82f6;
  position: relative;

  &.sell {
    border-left-color: #ef4444;
  }

  &.matched {
    border-left-color: #10b981;
    background: #f0fdf4;
  }

  &.live-only {
    border-left-color: #3b82f6;
    background: #eff6ff;
  }

  &.backtest-only {
    border-left-color: #9333ea;
    background: #faf5ff;
  }

  &.live {
    border-left-color: #3b82f6;
  }

  &.backtest {
    border-left-color: #9333ea;
  }
}

.signal-id {
  font-family: monospace;
  font-size: 12px;
  color: #6b7280;
}

.signal-info {
  margin-top: 5px;
  font-size: 14px;
}

.signal-detail {
  font-size: 12px;
  color: #6b7280;
  margin-top: 3px;
}

.signal-reason {
  font-size: 12px;
  color: #6b7280;
  margin-top: 3px;
}

.signal-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;

  &.matched {
    background: #10b981;
    color: white;
  }
}

.empty-state {
  padding: 40px;
  text-align: center;
  color: #6b7280;
}
</style>
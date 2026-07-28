<template>
  <div class="comparison-section">
    <h3 class="section-title">实盘与回测信号对比</h3>

    <!-- Summary Cards -->
    <div class="comparison-summary">
      <div class="comparison-metric">
        <label>信号数</label>
        <div class="value">{{ comparison?.total_live ?? 0 }} / {{ comparison?.total_backtest ?? 0 }}</div>
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

    <!-- Live-only Signals -->
    <div v-if="comparison?.unmatched_live?.length" class="signal-section">
      <h4>实盘独有信号:</h4>
      <div class="signal-list">
        <div
          v-for="sig in comparison.unmatched_live"
          :key="sig.signal_id || sig.live_signal_id"
          class="signal-item"
          :class="sig.side"
        >
          <div class="signal-id">{{ sig.signal_id || sig.live_signal_id }}</div>
          <div class="signal-info">{{ sig.timestamp || sig.time }} {{ sig.side }} | ${{ (sig.live_price || sig.price || 0).toLocaleString() }}</div>
          <div v-if="sig.reason" class="signal-reason">{{ sig.reason }}</div>
        </div>
      </div>
    </div>

    <!-- Backtest-only Signals -->
    <div v-if="comparison?.unmatched_backtest?.length" class="signal-section">
      <h4>回测独有信号:</h4>
      <div class="signal-list">
        <div
          v-for="sig in comparison.unmatched_backtest"
          :key="sig.signal_id || sig.backtest_signal_id"
          class="signal-item"
          :class="sig.side"
        >
          <div class="signal-id">{{ sig.signal_id || sig.backtest_signal_id }}</div>
          <div class="signal-info">{{ sig.timestamp || sig.time }} {{ sig.side }} | ${{ (sig.backtest_price || sig.price || 0).toLocaleString() }}</div>
          <div v-if="sig.reason" class="signal-reason">{{ sig.reason }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { SignalComparison } from '@/models/detail'

const props = defineProps<{
  comparison?: SignalComparison
}>()

const accuracyPercent = computed(() => {
  if (!props.comparison) return '0%'
  return `${(props.comparison.accuracy_score * 100).toFixed(0)}%`
})
</script>

<style scoped lang="scss">
.comparison-section {
  background: white;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 20px 0;
}

.comparison-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
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

  &.sell {
    border-left-color: #ef4444;
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

.signal-reason {
  font-size: 12px;
  color: #6b7280;
  margin-top: 3px;
}
</style>
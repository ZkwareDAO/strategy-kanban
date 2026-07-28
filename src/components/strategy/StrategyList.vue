<template>
  <div class="strategy-list">
    <!-- Header -->
    <div class="strategy-header">
      <div>策略名称</div>
      <div class="metrics-group">统计数据</div>
      <div>操作</div>
    </div>

    <!-- Strategy Items -->
    <div v-if="summaries.length > 0">
      <div
        v-for="summary in summaries"
        :key="summary.strategy"
        class="strategy-item"
      >
        <div class="strategy-row" @click="$emit('expand', summary.strategy)">
          <div class="strategy-name">{{ summary.strategy }}</div>
          <div class="metrics-group">
            <span class="metric">{{ summary.position_count }}仓</span>
            <span class="metric-sep">|</span>
            <span class="metric">胜率{{ summary.win_rate.toFixed(0) }}%</span>
            <span class="metric-sep">|</span>
            <span class="metric" :class="summary.avg_roi >= 0 ? 'roi-positive' : 'roi-negative'">
              平均ROI {{ formatRoi(summary.avg_roi) }}
            </span>
          </div>
          <button class="btn-expand">
            {{ expandedStrategy === summary.strategy ? '收起' : '展开' }}
          </button>
        </div>

        <!-- Position Details (slot for PositionTable) -->
        <div
          v-if="expandedStrategy === summary.strategy"
          class="position-details"
        >
          <slot :strategy="summary.strategy"></slot>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">暂无策略数据</div>
  </div>
</template>

<script setup lang="ts">
import type { StrategySummary } from '@/models/runtime'

defineProps<{
  summaries: StrategySummary[]
  expandedStrategy?: string
}>()

defineEmits<{
  expand: [strategy: string]
}>()

function formatRoi(value: number): string {
  const prefix = value >= 0 ? '+' : ''
  return `${prefix}${value.toFixed(2)}%`
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
  grid-template-columns: 1fr 2fr 100px;
  gap: 20px;
  font-size: 14px;
  color: #6b7280;
}

.strategy-item {
  border-bottom: 1px solid #e5e7eb;

  &:last-child {
    border-bottom: none;
  }
}

.strategy-row {
  padding: 20px;
  display: grid;
  grid-template-columns: 1fr 2fr 100px;
  gap: 20px;
  align-items: center;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: #f9fafb;
  }
}

.strategy-name {
  font-weight: 600;
  font-size: 15px;
}

.metrics-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.metric {
  font-size: 14px;
  color: #4b5563;
}

.metric-sep {
  color: #d1d5db;
}

.roi-positive {
  color: #10b981;
  font-weight: 600;
}

.roi-negative {
  color: #ef4444;
  font-weight: 600;
}

.btn-expand {
  padding: 6px 12px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.2s;

  &:hover {
    background: #2563eb;
  }
}

.position-details {
  background: #f9fafb;
  padding: 20px;
  border-top: 1px solid #e5e7eb;
}

.empty-state {
  padding: 40px;
  text-align: center;
  color: #6b7280;
}
</style>
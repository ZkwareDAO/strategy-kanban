<template>
  <div class="position-table">
    <!-- Header -->
    <div class="position-header">
      <div v-if="showSymbol">代币</div>
      <div>开仓点</div>
      <div>平仓点</div>
      <div>ROI</div>
      <div>入场价格</div>
      <div>操作</div>
    </div>

    <!-- Rows -->
    <div v-if="positions.length > 0">
      <div
        v-for="(position, index) in positions"
        :key="position.position_id"
        class="position-row"
      >
        <div v-if="showSymbol" class="symbol">{{ symbols?.[index] ?? '' }}</div>
        <div>{{ position.entry_time }}</div>
        <div :class="{ holding: !position.exit_time }">
          {{ position.exit_time || '持仓中' }}
        </div>
        <div :class="position.realized_pnl >= 0 ? 'roi-positive' : 'roi-negative'">
          {{ formatPnl(position.realized_pnl) }}
        </div>
        <div class="price">{{ formatPrice(position.entry_price) }}</div>
        <button class="btn-view" @click="$emit('view', position)">查看</button>
      </div>
    </div>

    <div v-else class="empty-state">当日无持仓</div>
  </div>
</template>

<script setup lang="ts">
import type { Position } from '@/models/position'

defineProps<{
  positions: Position[]
  showSymbol?: boolean
  symbols?: string[]
}>()

defineEmits<{
  view: [position: Position]
}>()

function formatPrice(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatPnl(value: number): string {
  const prefix = value >= 0 ? '+' : ''
  return `${prefix}${value.toFixed(2)}%`
}
</script>

<style scoped lang="scss">
.position-table {
  background: white;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #e5e7eb;
}

.position-header {
  background: #f3f4f6;
  padding: 12px 20px;
  display: grid;
  grid-template-columns: 1.5fr 1fr 1fr 1fr 1.2fr 100px;
  gap: 15px;
  font-weight: 600;
  font-size: 13px;
  color: #6b7280;
}

.position-row {
  padding: 15px 20px;
  display: grid;
  grid-template-columns: 1.5fr 1fr 1fr 1fr 1.2fr 100px;
  gap: 15px;
  border-top: 1px solid #e5e7eb;
  align-items: center;
  font-size: 14px;
}

.symbol {
  font-weight: 500;
}

.holding {
  color: #6b7280;
  font-style: italic;
}

.price {
  font-family: monospace;
}

.roi-positive {
  color: #10b981;
  font-weight: 600;
}

.roi-negative {
  color: #ef4444;
  font-weight: 600;
}

.btn-view {
  padding: 6px 12px;
  background: #10b981;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.2s;

  &:hover {
    background: #059669;
  }
}

.empty-state {
  padding: 20px;
  text-align: center;
  color: #6b7280;
}
</style>
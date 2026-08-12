<template>
  <div class="timeframe-selector">
    <div class="selector-header">
      <span class="selector-label">时间周期:</span>
    </div>
    <div class="timeframe-buttons">
      <button
        v-for="tf in timeframes"
        :key="tf.value"
        :class="['timeframe-btn', { active: modelValue === tf.value }]"
        @click="$emit('update:modelValue', tf.value)"
      >
        {{ tf.label }}
      </button>
    </div>
    <div class="display-control">
      <label>
        <span>显示K线数:</span>
        <input
          type="number"
          :value="displayCount"
          @input="$emit('update:displayCount', Number(($event.target as HTMLInputElement).value))"
          min="10"
          max="500"
          step="10"
        />
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TimeframeValue } from '@/models/kline'

interface Props {
  modelValue: TimeframeValue
  displayCount: number
}

defineProps<Props>()
defineEmits<{
  'update:modelValue': [value: TimeframeValue]
  'update:displayCount': [value: number]
}>()

const timeframes = [
  { value: '1m' as TimeframeValue, label: '1分钟' },
  { value: '5m' as TimeframeValue, label: '5分钟' },
  { value: '15m' as TimeframeValue, label: '15分钟' },
  { value: '30m' as TimeframeValue, label: '30分钟' },
  { value: '1h' as TimeframeValue, label: '1小时' },
  { value: '4h' as TimeframeValue, label: '4小时' },
  { value: '1d' as TimeframeValue, label: '1天' },
]
</script>

<style scoped lang="scss">
.timeframe-selector {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: white;
  border-radius: 8px;
  margin-bottom: 1rem;
  flex-wrap: wrap;

  .selector-header {
    .selector-label {
      font-weight: 600;
      color: #374151;
    }
  }

  .timeframe-buttons {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .timeframe-btn {
    padding: 0.4rem 0.8rem;
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
    transition: all 0.2s;

    &:hover {
      background: #e5e7eb;
    }

    &.active {
      background: #3b82f6;
      color: white;
      border-color: #3b82f6;
    }
  }

  .display-control {
    margin-left: auto;

    label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.85rem;
      color: #6b7280;

      input {
        width: 80px;
        padding: 0.3rem 0.5rem;
        border: 1px solid #d1d5db;
        border-radius: 4px;
        font-size: 0.85rem;
      }
    }
  }
}
</style>
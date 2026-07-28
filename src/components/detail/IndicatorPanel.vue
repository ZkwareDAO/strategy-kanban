<template>
  <div class="indicator-panel">
    <div class="panel-header">
      <h3>技术指标</h3>
      <button @click="toggleAll" class="toggle-btn">
        {{ allSelected ? '清除全部' : '全选' }}
      </button>
    </div>

    <div class="indicator-list">
      <label
        v-for="indicator in availableIndicators"
        :key="indicator.type"
        class="indicator-item"
      >
        <input
          type="checkbox"
          :checked="selectedIndicators.includes(indicator.type)"
          @change="toggleIndicator(indicator.type)"
        />
        <span class="indicator-name">{{ indicator.name }}</span>
        <span class="indicator-desc">{{ indicator.description }}</span>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { IndicatorType } from '@/indicators'

interface Props {
  modelValue: IndicatorType[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: IndicatorType[]]
}>()

const availableIndicators = [
  { type: 'RSI' as IndicatorType, name: 'RSI', description: '相对强弱指数' },
  { type: 'MACD' as IndicatorType, name: 'MACD', description: '指数平滑异同移动平均线' },
  { type: 'ATR' as IndicatorType, name: 'ATR', description: '平均真实波幅' },
  { type: 'EMA' as IndicatorType, name: 'EMA', description: '指数移动平均线' },
]

const selectedIndicators = computed(() => props.modelValue)

const allSelected = computed(() => {
  return availableIndicators.every(i => selectedIndicators.value.includes(i.type))
})

function toggleIndicator(type: IndicatorType) {
  const current = [...selectedIndicators.value]
  const index = current.indexOf(type)

  if (index >= 0) {
    current.splice(index, 1)
  } else {
    current.push(type)
  }

  emit('update:modelValue', current)
}

function toggleAll() {
  if (allSelected.value) {
    emit('update:modelValue', [])
  } else {
    emit('update:modelValue', availableIndicators.map(i => i.type))
  }
}
</script>

<style scoped>
.indicator-panel {
  padding: 1rem;
  background: #f5f5f5;
  border-radius: 4px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.panel-header h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.toggle-btn {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  background: #2196f3;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.toggle-btn:hover {
  background: #1976d2;
}

.indicator-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.indicator-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.indicator-item input {
  cursor: pointer;
}

.indicator-name {
  font-weight: 500;
  min-width: 60px;
}

.indicator-desc {
  color: #666;
  font-size: 0.85rem;
}
</style>

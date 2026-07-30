<template>
  <div class="indicator-panel">
    <div class="panel-header" @click="togglePanel">
      <div class="header-left">
        <span class="expand-icon">{{ expanded ? '▼' : '▶' }}</span>
        <h3>技术指标选择</h3>
      </div>
      <div class="header-right">
        <span class="selected-count">{{ selectedIndicators.length }} 项已选</span>
        <button @click.stop="toggleAll" class="toggle-btn">
          {{ allSelected ? '清除全部' : '全选' }}
        </button>
      </div>
    </div>

    <div v-show="expanded" class="indicator-list">
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
import { ref, computed } from 'vue'
import type { IndicatorType } from '@/indicators'

interface Props {
  modelValue: IndicatorType[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: IndicatorType[]]
}>()

const expanded = ref(false)

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

function togglePanel() {
  expanded.value = !expanded.value
}

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

<style scoped lang="scss">
.indicator-panel {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  margin-top: 1rem;
  overflow: hidden;

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    cursor: pointer;
    user-select: none;
    transition: background 0.2s;

    &:hover {
      background: #f9fafb;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 0.5rem;

      .expand-icon {
        font-size: 0.8rem;
        color: #6b7280;
        transition: transform 0.2s;
      }

      h3 {
        margin: 0;
        font-size: 0.95rem;
        font-weight: 500;
        color: #374151;
      }
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 0.75rem;

      .selected-count {
        font-size: 0.85rem;
        color: #6b7280;
      }

      .toggle-btn {
        padding: 0.3rem 0.75rem;
        font-size: 0.8rem;
        background: #3b82f6;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        transition: background 0.2s;

        &:hover {
          background: #2563eb;
        }
      }
    }
  }

  .indicator-list {
    padding: 1rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    border-top: 1px solid #e5e7eb;

    .indicator-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;

      &:hover {
        background: #f3f4f6;
        border-color: #d1d5db;
      }

      input {
        cursor: pointer;
      }

      .indicator-name {
        font-weight: 500;
        color: #374151;
      }

      .indicator-desc {
        color: #9ca3af;
        font-size: 0.8rem;
      }
    }
  }
}

// 折叠动画
.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
  max-height: 200px;
  overflow: hidden;
}

.slide-enter-from,
.slide-leave-to {
  max-height: 0;
  opacity: 0;
}
</style>

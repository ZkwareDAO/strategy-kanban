<template>
  <div class="indicator-panel">
    <div class="panel-header" @click="togglePanel">
      <div class="header-left">
        <span class="expand-icon">{{ expanded ? '▼' : '▶' }}</span>
        <h3>技术指标选择</h3>
        <span v-if="strategyConfig" class="strategy-badge">{{ strategyConfig.display_name }}</span>
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
        :class="{ 'strategy-default': strategyDefaultSet.has(indicator.type) }"
      >
        <input
          type="checkbox"
          :checked="selectedIndicators.includes(indicator.type)"
          @change="toggleIndicator(indicator.type)"
        />
        <span class="indicator-name">{{ indicator.name }}</span>
        <span class="indicator-desc">{{ indicator.description }}</span>
        <span v-if="strategyDefaultSet.has(indicator.type)" class="default-badge">策略默认</span>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { IndicatorType } from '@/indicators'
import { getStrategyConfig } from '@/config/strategies'

interface Props {
  modelValue: IndicatorType[]
  strategy?: string
}

const props = withDefaults(defineProps<Props>(), {
  strategy: '',
})
const emit = defineEmits<{
  'update:modelValue': [value: IndicatorType[]]
}>()

const expanded = ref(false)

/** 所有可用指标定义 */
const ALL_INDICATORS: { type: IndicatorType; name: string; description: string }[] = [
  { type: 'RSI', name: 'RSI', description: '相对强弱指数' },
  { type: 'MACD', name: 'MACD', description: '指数平滑异同移动平均线' },
  { type: 'ATR', name: 'ATR', description: '平均真实波幅' },
  { type: 'EMA', name: 'EMA', description: '指数移动平均线' },
  { type: 'BOLL', name: 'BOLL', description: '布林带' },
  { type: 'KD', name: 'KD', description: '随机指标' },
  { type: 'ADX', name: 'ADX', description: '趋势强度指标' },
  { type: 'OBV', name: 'OBV', description: '能量潮' },
  { type: 'Donchian', name: 'Donchian', description: '唐奇安通道' },
  { type: 'Envelope', name: 'Envelope', description: '均线包络通道' },
  { type: 'SMA', name: 'SMA', description: '简单移动平均线' },
]

/** 策略配置 */
const strategyConfig = computed(() => {
  if (!props.strategy) return null
  return getStrategyConfig(props.strategy)
})

/** 策略默认指标集合 */
const strategyDefaultSet = computed(() => {
  if (!strategyConfig.value) return new Set<string>()
  return new Set(strategyConfig.value.indicators)
})

/** 根据策略动态生成可用指标列表 */
const availableIndicators = computed(() => {
  if (!strategyConfig.value) {
    return ALL_INDICATORS
  }
  const strategyTypes = new Set(strategyConfig.value.indicators)
  const strategyItems = ALL_INDICATORS.filter(i => strategyTypes.has(i.type))
  const otherItems = ALL_INDICATORS.filter(i => !strategyTypes.has(i.type))
  return [...strategyItems, ...otherItems]
})

const selectedIndicators = computed(() => props.modelValue)

const allSelected = computed(() => {
  return availableIndicators.value.every(i => selectedIndicators.value.includes(i.type))
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
    emit('update:modelValue', availableIndicators.value.map(i => i.type))
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

      .strategy-badge {
        font-size: 0.75rem;
        padding: 0.15rem 0.5rem;
        background: #eff6ff;
        color: #3b82f6;
        border-radius: 4px;
        font-weight: 500;
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

      &.strategy-default {
        background: #eff6ff;
        border-color: #bfdbfe;

        .indicator-name {
          color: #1d4ed8;
        }
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

      .default-badge {
        font-size: 0.7rem;
        padding: 0.1rem 0.4rem;
        background: #dbeafe;
        color: #3b82f6;
        border-radius: 3px;
      }
    }
  }
}

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

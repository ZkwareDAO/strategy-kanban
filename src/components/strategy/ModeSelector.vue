<template>
  <div class="mode-selector">
    <label class="mode-label">运行模式:</label>
    <div class="mode-options">
      <label
        v-for="mode in modes"
        :key="mode.value"
        class="mode-option"
        :class="{ active: modelValue === mode.value }"
      >
        <input
          type="radio"
          :value="mode.value"
          :checked="modelValue === mode.value"
          @change="$emit('update:modelValue', mode.value)"
        />
        <span class="mode-text">{{ mode.label }}</span>
        <span class="mode-count">{{ counts[mode.value] }}</span>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ModeCounts } from '@/models/runtime'

defineProps<{
  counts: ModeCounts
  modelValue: 'live' | 'paper_trading' | 'smoking'
}>()

defineEmits<{
  'update:modelValue': [value: 'live' | 'paper_trading' | 'smoking']
}>()

const modes = [
  { value: 'live' as const, label: 'Live' },
  { value: 'paper_trading' as const, label: 'Paper' },
  { value: 'smoking' as const, label: 'Smoking' },
]
</script>

<style scoped lang="scss">
.mode-selector {
  background: white;
  padding: 15px 20px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 15px;
}

.mode-label {
  font-weight: 600;
  color: #4b5563;
}

.mode-options {
  display: flex;
  gap: 20px;
}

.mode-option {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;

  input[type="radio"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }

  .mode-text {
    font-size: 14px;
    transition: all 0.2s;
  }

  .mode-count {
    background: #e5e7eb;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 12px;
    color: #6b7280;
    transition: all 0.2s;
  }

  &.active {
    .mode-text {
      font-weight: 600;
      color: #3b82f6;
    }

    .mode-count {
      background: #3b82f6;
      color: white;
    }
  }
}
</style>
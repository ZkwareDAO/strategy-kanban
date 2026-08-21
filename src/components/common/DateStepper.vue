<template>
  <div class="date-stepper">
    <button class="step-btn" title="前一日" @click="step(-1)">‹</button>
    <el-date-picker
      :model-value="modelValue"
      type="date"
      placeholder="选择日期"
      format="YYYY-MM-DD"
      value-format="YYYYMMDD"
      :clearable="false"
      @update:model-value="onPick"
    />
    <button
      class="step-btn"
      title="后一日"
      :disabled="isNextDisabled"
      @click="step(1)"
    >›</button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { shiftCompactDate, isAfterToday } from '@/utils/compactDate'

const props = defineProps<{
  /** 紧凑日期 YYYYMMDD */
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [date: string]
}>()

// 后一日不可超过今天--未来日期不会有数据，放开只会让用户翻到空页面
const isNextDisabled = computed(() => isAfterToday(shiftCompactDate(props.modelValue, 1)))

function step(delta: number): void {
  const next = shiftCompactDate(props.modelValue, delta)
  if (next) emit('update:modelValue', next)
}

/**
 * el-date-picker 清空时会给出 null。此处已关闭 clearable，
 * 但仍做防御--吞掉空值比让上层拿着 '' 去查一个不存在的日期更安全。
 */
function onPick(value: unknown): void {
  if (typeof value === 'string' && value) emit('update:modelValue', value)
}
</script>

<style scoped lang="scss">
.date-stepper {
  display: flex;
  align-items: center;
  gap: 6px;
}

.step-btn {
  width: 30px;
  height: 30px;
  border-radius: 6px;
  border: 1px solid #dcdfe6;
  background: #fff;
  color: #606266;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.15s;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &:hover:not(:disabled) {
    border-color: #3b82f6;
    color: #3b82f6;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}
</style>

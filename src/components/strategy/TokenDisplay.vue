<template>
  <div class="token-display">
    <div class="token-list">
      <span
        v-for="(item, index) in visibleTokens"
        :key="index"
        class="token-tag clickable"
        :class="`mode-${item.mode}`"
        @click="$emit('click', item.token)"
      >
        {{ item.token }}
      </span>
      <span v-if="hasMoreTokens" class="more-tokens">
        <el-popover
          placement="bottom"
          :width="200"
          trigger="click"
        >
          <template #reference>
            <span class="more-btn">+{{ remainingCount }}</span>
          </template>
          <div class="token-popover">
            <span
              v-for="(item, index) in remainingTokens"
              :key="index"
              class="token-tag clickable"
              :class="`mode-${item.mode}`"
              @click="$emit('click', item.token)"
            >
              {{ item.token }}
            </span>
          </div>
        </el-popover>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TradingMode } from '@/models/runtime'

const props = defineProps<{
  tokens: { token: string; mode: TradingMode }[]
}>()

defineEmits<{
  click: [token: string]
}>()

const MAX_VISIBLE = 5

const visibleTokens = computed(() => {
  return props.tokens.slice(0, MAX_VISIBLE)
})

const remainingTokens = computed(() => {
  return props.tokens.slice(MAX_VISIBLE)
})

const hasMoreTokens = computed(() => {
  return props.tokens.length > MAX_VISIBLE
})

const remainingCount = computed(() => {
  return props.tokens.length - MAX_VISIBLE
})
</script>

<style scoped lang="scss">
.token-display {
  display: flex;
  align-items: center;
}

.token-list {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.token-tag {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.token-tag.clickable {
  cursor: pointer;
  transition: all 0.2s;
}

.mode-live {
  background: #fee2e2;
  color: #dc2626;

  &:hover {
    background: #fecaca;
    transform: translateY(-1px);
  }
}

.mode-paper_trading {
  background: #fef3c7;
  color: #d97706;

  &:hover {
    background: #fde68a;
    transform: translateY(-1px);
  }
}

.mode-smoking {
  background: #e0e7ff;
  color: #4f46e5;

  &:hover {
    background: #c7d2fe;
    transform: translateY(-1px);
  }
}

.more-tokens {
  display: inline-flex;
}

.more-btn {
  display: inline-block;
  padding: 4px 10px;
  background: #f3f4f6;
  color: #6b7280;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #e5e7eb;
    color: #374151;
  }
}

.token-popover {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-width: 200px;
}
</style>

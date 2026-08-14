<template>
  <div class="token-display">
    <div class="token-list">
      <span
        v-for="(item, index) in visibleTokens"
        :key="index"
        class="token-chip"
        :class="{ 'no-data': !item.hasData, clickable: item.hasData }"
        :title="item.token"
        @click="$emit('click', item.token)"
      >{{ formatSymbol(item.token)
      }}<span v-if="index < visibleTokens.length - 1" class="sep">|</span></span>
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
              class="token-chip"
              :class="{ 'no-data': !item.hasData, clickable: item.hasData }"
              :title="item.token"
              @click="$emit('click', item.token)"
            >{{ formatSymbol(item.token)
            }}<span v-if="index < remainingTokens.length - 1" class="sep">|</span></span>
          </div>
        </el-popover>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { formatSymbol } from '@/utils/display'
import type { TradingMode } from '@/models/runtime'

const props = defineProps<{
  tokens: { token: string; mode: TradingMode; hasData: boolean }[]
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
  flex-wrap: wrap;
}

// 与「策略发现」表格同款：纯文本 + | 分隔，不用彩色标签
.token-chip {
  display: inline-block;
  font-size: 13px;
  font-weight: 500;
  color: #374151;

  .sep {
    color: #d1d5db;
    margin: 0 4px;
    font-weight: 400;
  }
}

// 无数据不可下钻：弱化而非配色区分，属功能性反馈
.token-chip.no-data {
  color: #9ca3af;
  cursor: default;
}

.token-chip.clickable {
  cursor: pointer;

  &:hover {
    color: #2563eb;
  }
}

.more-tokens {
  display: inline-flex;
  margin-left: 8px;
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
  max-width: 200px;
  line-height: 1.9;
}
</style>

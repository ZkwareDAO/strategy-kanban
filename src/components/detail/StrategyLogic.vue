<template>
  <div class="strategy-logic">
    <div class="logic-header" @click="toggle">
      <span>策略逻辑:</span>
      <el-button type="primary" link>
        {{ expanded ? '收起 ▲' : '展开 ▼' }}
      </el-button>
    </div>

    <el-collapse-transition>
      <div v-show="expanded" class="logic-content">
        <div v-for="section in sections" :key="section.title" class="logic-section">
          <h4>{{ section.title }}</h4>
          <ul>
            <li v-for="(rule, idx) in section.rules" :key="idx">{{ rule }}</li>
          </ul>
        </div>
      </div>
    </el-collapse-transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { StrategyLogic, LogicSection } from '@/models/detail'

const props = defineProps<{
  logic?: StrategyLogic
}>()

const expanded = ref(false)

const sections = computed<LogicSection[]>(() => {
  if (!props.logic) return []
  return [
    props.logic.entry_conditions,
    props.logic.exit_conditions,
    props.logic.risk_management,
  ]
})

function toggle() {
  expanded.value = !expanded.value
}
</script>

<style scoped lang="scss">
.strategy-logic {
  margin-bottom: 20px;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  overflow: hidden;
}

.logic-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #f5f7fa;
  cursor: pointer;

  span {
    font-weight: 500;
    color: #303133;
  }
}

.logic-content {
  padding: 16px;
  max-height: 300px;
  overflow-y: auto;
}

.logic-section {
  margin-bottom: 16px;

  &:last-child {
    margin-bottom: 0;
  }

  h4 {
    color: #409eff;
    margin: 0 0 8px 0;
    font-size: 14px;
  }

  ul {
    margin: 0;
    padding-left: 20px;

    li {
      margin-bottom: 4px;
      color: #606266;
      line-height: 1.6;
    }
  }
}
</style>
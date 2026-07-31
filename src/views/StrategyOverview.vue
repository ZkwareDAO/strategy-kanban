<template>
  <div class="strategy-overview">
    <!-- Header -->
    <div class="header">
      <h1>交易复盘系统</h1>
      <div class="date-picker">
        <label>日期:</label>
        <el-date-picker
          v-model="selectedDate"
          type="date"
          placeholder="选择日期"
          format="YYYY-MM-DD"
          value-format="YYYYMMDD"
          @change="handleDateChange"
        />
      </div>
    </div>

    <!-- Strategy List -->
    <div v-if="strategyStore.loading" class="loading">加载中...</div>
    <strategy-list
      v-else
      :summaries="strategyStore.strategySummaries"
      :runtimes="strategyStore.runtimes"
      :positions="strategyStore.positions"
      @view-position="handleViewPosition"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useStrategyStore } from '@/stores/strategy'
import { useAppStore } from '@/stores/app'
import StrategyList from '@/components/strategy/StrategyList.vue'

const router = useRouter()
const strategyStore = useStrategyStore()
const appStore = useAppStore()

const selectedDate = ref('')

async function handleDateChange(date: string) {
  appStore.setDate(date)
  await strategyStore.fetchRuntimes(date)
}

function handleViewPosition(runtimeName: string, symbol: string) {
  const runtime = strategyStore.runtimes.find(r => r.runtime_name === runtimeName)
  if (runtime) {
    router.push({
      name: 'TokenDetail',
      params: {
        strategy: runtime.strategy,
        symbol: symbol,
      },
      query: {
        runtime: runtime.runtime_name,
        date: appStore.date,
      },
    })
  }
}

onMounted(async () => {
  // 如果 appStore 已经有日期（从详情页返回），使用之前选择的日期
  // 否则默认选择昨天的日期
  if (appStore.date) {
    selectedDate.value = appStore.date
    await strategyStore.fetchRuntimes(appStore.date)
  } else {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const defaultDate = yesterday.toISOString().slice(0, 10).replace(/-/g, '')
    selectedDate.value = defaultDate
    await handleDateChange(defaultDate)
  }
})
</script>

<style scoped lang="scss">
.strategy-overview {
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
  box-sizing: border-box;
}

.header {
  background: white;
  padding: 20px 30px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  margin-bottom: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;

  h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 700;
    color: #1a1a1a;
    letter-spacing: 1px;
  }
}

.date-picker {
  display: flex;
  gap: 10px;
  align-items: center;

  label {
    font-size: 14px;
    color: #6b7280;
  }
}

.loading {
  text-align: center;
  padding: 40px;
  font-size: 16px;
  color: #6b7280;
}
</style>
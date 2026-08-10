<template>
  <div class="token-detail">
    <!-- Back Button -->
    <button class="back-btn" @click="$router.back()">← 返回总览</button>

    <!-- Loading State -->
    <div v-if="loading" class="loading">加载中...</div>

    <!-- Error State -->
    <div v-else-if="error" class="error">{{ error }}</div>

    <!-- Detail Content -->
    <template v-else>
      <!-- Detail Header -->
      <div class="detail-header">
        <h2>{{ strategy }} / {{ symbol }}</h2>
        <p>运行实例: {{ runtimeName }} | 日期: {{ formattedDate }}</p>
        <el-tag :type="modeTagType">{{ modeLabel }}</el-tag>

        <!-- Strategy Logic Inline -->
        <div class="strategy-logic-inline">
          <div class="logic-toggle" @click="logicExpanded = !logicExpanded">
            <span class="logic-label">策略逻辑:</span>
            <button class="btn-toggle-inline">{{ logicExpanded ? '[收起 ▲]' : '[展开 ▼]' }}</button>
          </div>
          <div v-show="logicExpanded" class="logic-content-inline">
            <div class="logic-section-inline">
              <div class="logic-title-inline">【开仓条件】</div>
              <ul>
                <li v-for="(rule, idx) in strategyLogic.entry_conditions.rules" :key="idx">{{ rule }}</li>
              </ul>
            </div>
            <div class="logic-section-inline">
              <div class="logic-title-inline">【平仓条件】</div>
              <ul>
                <li v-for="(rule, idx) in strategyLogic.exit_conditions.rules" :key="idx">{{ rule }}</li>
              </ul>
            </div>
            <div class="logic-section-inline">
              <div class="logic-title-inline">【风控】</div>
              <ul>
                <li v-for="(rule, idx) in strategyLogic.risk_management.rules" :key="idx">{{ rule }}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <!-- Chart Controls -->
      <div class="chart-controls">
        <!-- 回放对比复选框 -->
        <div class="backplay-toggle">
          <label class="checkbox-label">
            <input type="checkbox" v-model="showBackplay" />
            <span>回放对比</span>
          </label>
          <span v-if="backplayLoading" class="backplay-status">加载中...</span>
          <span v-else-if="backplayTrades.length === 0 && showBackplay" class="backplay-status">无回放数据</span>
          <span v-else-if="backplayTrades.length > 0" class="backplay-status success">
            {{ backplayTrades.length }} 条回放信号
          </span>
        </div>

        <!-- Indicator Panel -->
        <IndicatorPanel v-model="selectedIndicators" :strategy="strategyPrefix" />
      </div>

      <!-- Timeframe Selector -->
      <TimeframeSelector
        v-model="selectedTimeframe"
        v-model:display-count="displayCount"
      />
      <div v-if="dataWarning" class="data-warning">
        ⚠️ {{ dataWarning }}
      </div>

      <!-- Chart -->
      <TechnicalChart
        :kline-data="processedKlineData"
        :strategy="strategy"
        :symbol="symbol"
        :indicators="selectedIndicators"
        :display-count="displayCount"
        :backplay-signals="showBackplay ? backplaySignals : undefined"
        @entry-click="handleEntryClick"
        @exit-click="handleExitClick"
      />

      <!-- Entry Detail Dialog -->
      <el-dialog
        v-model="entryDialogVisible"
        :title="entryDialogTitle"
        width="90%"
        top="5vh"
        :fullscreen="false"
      >
        <div class="dialog-content">
          <PriceRoiChart
            v-if="entryDialogVisible"
            :timeline-data="klineData"
            :highlight-position-id="highlightPositionId"
          />
        </div>
      </el-dialog>

      <!-- Comparison -->
      <ComparisonReport :comparison="comparisonData" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getKline, getComparison, getBacktestTrades } from '@/api/strategy'
import { resampleKline, getDefaultDisplayCount } from '@/utils/resample'
import PriceRoiChart from '@/components/detail/PriceRoiChart.vue'
import TechnicalChart from '@/components/detail/TechnicalChart.vue'
import IndicatorPanel from '@/components/detail/IndicatorPanel.vue'
import TimeframeSelector from '@/components/detail/TimeframeSelector.vue'
import ComparisonReport from '@/components/detail/ComparisonReport.vue'
import type { StrategyLogic as StrategyLogicType, SignalComparison } from '@/models/detail'
import type { KlinePoint, TimeframeValue } from '@/models/kline'
import type { IndicatorType } from '@/indicators'
import type { BacktestSignal } from '@/models/backtest'
import { getStrategyConfigByDir, type StrategyConfig } from '@/config/strategies'

const props = defineProps<{
  strategy: string
  symbol: string
}>()

const route = useRoute()
const runtimeName = computed(() => (route.query.runtime as string) ?? '')
const dirName = computed(() => (route.query.dir as string) ?? '')
const date = computed(() => (route.query.date as string) ?? '')

const formattedDate = computed(() => {
  if (!date.value) return ''
  return `${date.value.slice(0, 4)}-${date.value.slice(4, 6)}-${date.value.slice(6, 8)}`
})

const tradingMode = computed(() => {
  const name = runtimeName.value.toUpperCase()
  if (name.includes('_LIVE') || name.endsWith('LIVE')) return 'live'
  if (name.includes('_PAPER') || name.endsWith('PAPER')) return 'paper_trading'
  if (name.includes('_SMOKING') || name.endsWith('SMOKING')) return 'smoking'
  return ''
})

const modeLabel = computed(() => {
  const map: Record<string, string> = {
    live: '实盘',
    paper_trading: '模拟盘',
    smoking: '冒烟测试',
  }
  return map[tradingMode.value] ?? ''
})

const modeTagType = computed(() => {
  const map: Record<string, string> = {
    live: 'danger',
    paper_trading: 'warning',
    smoking: 'info',
  }
  return (map[tradingMode.value] ?? 'info') as 'danger' | 'warning' | 'info'
})

const logicExpanded = ref(false)
const loading = ref(true)
const error = ref<string | null>(null)
const klineData = ref<KlinePoint[]>([])
const comparisonData = ref<SignalComparison | undefined>(undefined)
const selectedIndicators = ref<IndicatorType[]>([])
const selectedTimeframe = ref<TimeframeValue>('5m')
const displayCount = ref(100)

// 回放对比相关状态
const showBackplay = ref(false)
const backplayLoading = ref(false)
const backplayTrades = ref<BacktestSignal[]>([])

// 开仓点详情弹框
const entryDialogVisible = ref(false)
const entryDialogTitle = ref('')
const highlightPositionId = ref('')

// 处理开仓点点击
function handleEntryClick(entry: { position_id: string; position_type: string; entry_price: number; datetime: string }) {
  entryDialogTitle.value = `${entry.position_type === 'long' ? '做多' : '做空'}开仓 - $${entry.entry_price.toFixed(2)} - ${entry.datetime}`
  highlightPositionId.value = entry.position_id
  entryDialogVisible.value = true
}

// 处理平仓点点击
function handleExitClick(exit: { position_id: string; position_type: string; exit_price: number; datetime: string }) {
  entryDialogTitle.value = `${exit.position_type === 'long' ? '做多' : '做空'}平仓 - $${exit.exit_price.toFixed(2)} - ${exit.datetime}`
  highlightPositionId.value = exit.position_id
  entryDialogVisible.value = true
}

// 监听弹框打开，触发窗口 resize 事件让 ECharts 重新计算尺寸
watch(entryDialogVisible, (visible) => {
  if (visible) {
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'))
    }, 200)
  }
})

// 重采样数据
const processedKlineData = computed(() => {
  if (!klineData.value.length) return []
  return resampleKline(klineData.value, selectedTimeframe.value)
})

// 数据量警告
const dataWarning = computed(() => {
  const resampledLength = processedKlineData.value.length
  const minRequired = 20 // 最少需要 20 根 K 线

  if (resampledLength < minRequired) {
    return `当前周期数据不足（${resampledLength} 根），建议选择更短的时间周期或查看更长时间范围的数据`
  }
  return null
})

// 回放信号
const backplaySignals = computed(() => backplayTrades.value)

// 监听时间周期变化，更新默认显示数量
watch(selectedTimeframe, (tf) => {
  displayCount.value = getDefaultDisplayCount(tf)
}, { immediate: true })

// 策略配置（直接用策略目录名查找，复用 PREFIX_STRATEGY_MAP 映射）
const strategyConfig = computed<StrategyConfig | null>(() => getStrategyConfigByDir(props.strategy))
const strategyPrefix = computed(() => strategyConfig.value?.strategy_prefix ?? '')

// 策略逻辑（从策略配置获取，未匹配时使用默认）
const strategyLogic = computed<StrategyLogicType>(() => {
  const config = strategyConfig.value
  if (config) {
    return {
      entry_conditions: { title: '入场条件', rules: config.logic.entry },
      exit_conditions: { title: '出场条件', rules: config.logic.exit },
      risk_management: { title: '风控规则', rules: config.logic.risk },
    }
  }
  // fallback 默认逻辑
  return {
    entry_conditions: {
      title: '入场条件',
      rules: ['策略逻辑未配置，请查看策略代码'],
    },
    exit_conditions: {
      title: '出场条件',
      rules: ['策略逻辑未配置，请查看策略代码'],
    },
    risk_management: {
      title: '风控规则',
      rules: ['策略逻辑未配置，请查看策略代码'],
    },
  }
})

// 根据策略配置设置默认指标
watch(strategyConfig, (config) => {
  if (config) {
    // 过滤出前端已实现的指标
    const implemented = config.indicators.filter(
      (i): i is IndicatorType => ['RSI', 'MACD', 'ATR', 'EMA', 'BOLL', 'KD', 'ADX', 'OBV', 'Donchian', 'Envelope', 'SMA'].includes(i)
    )
    if (implemented.length > 0) {
      selectedIndicators.value = implemented
      return
    }
  }
  // fallback 默认指标
  selectedIndicators.value = ['RSI', 'MACD', 'ATR']
}, { immediate: true })

async function fetchData() {
  if (!runtimeName.value || !date.value) {
    error.value = '缺少运行实例或日期参数'
    loading.value = false
    return
  }

  loading.value = true
  error.value = null

  try {
    // 并行获取K线和对比数据
    const [kline, comparison] = await Promise.all([
      getKline(runtimeName.value, date.value).catch(() => []),
      getComparison(dirName.value || props.strategy, props.symbol, date.value).catch(() => undefined),
    ])

    klineData.value = kline
    comparisonData.value = comparison
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败'
  } finally {
    loading.value = false
  }
}

// 加载回放数据
async function fetchBackplayData() {
  if (!date.value) return

  backplayLoading.value = true
  try {
    // 只从 CSV 文件加载回放数据（包含正确的开仓和平仓信息）
    const trades = await getBacktestTrades(date.value, dirName.value || props.strategy, props.symbol)

    if (trades.length > 0) {
      // 转换为信号点
      const signals: BacktestSignal[] = []

      for (const trade of trades) {
        const isLong = trade.side === 'BUY' || trade.side === 'BUY_CLOSE'
        const isOpen = trade.side === 'BUY' || trade.side === 'SELL'
        const datetime = trade.timestamp.replace('T', ' ').substring(0, 19)

        signals.push({
          datetime,
          price: trade.price,
          position_type: isLong ? 'long' : 'short',
          action: isOpen ? 'open' : 'close'
        })
      }

      backplayTrades.value = signals
    } else {
      // CSV数据不存在，清空回放信号（不使用错误的comparison数据）
      backplayTrades.value = []
    }
  } catch (err) {
    console.error('Failed to load backplay data:', err)
    backplayTrades.value = []
  } finally {
    backplayLoading.value = false
  }
}

// 监听回放对比开关
watch(showBackplay, (value) => {
  if (value && backplayTrades.value.length === 0) {
    fetchBackplayData()
  }
})

onMounted(fetchData)
</script>

<style scoped lang="scss">
.token-detail {
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 20px;
  font-size: 14px;
  transition: all 0.2s;

  &:hover {
    background: #f9fafb;
  }
}

.loading,
.error {
  text-align: center;
  padding: 40px;
  font-size: 16px;
  color: #6b7280;
}

.error {
  color: #ef4444;
}

.detail-header {
  background: white;
  padding: 20px 30px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  margin-bottom: 20px;

  h2 {
    margin: 0 0 10px 0;
  }

  p {
    color: #6b7280;
    margin: 0 0 15px 0;
  }
}

.strategy-logic-inline {
  margin-top: 15px;
  border-top: 1px solid #e5e7eb;
  padding-top: 15px;
}

.logic-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.logic-label {
  font-size: 14px;
  color: #6b7280;
}

.btn-toggle-inline {
  background: none;
  border: none;
  color: #3b82f6;
  font-size: 13px;
  cursor: pointer;
  padding: 0;

  &:hover {
    text-decoration: underline;
  }
}

.logic-content-inline {
  margin-top: 15px;
  padding: 15px;
  background: #f9fafb;
  border-radius: 8px;
  max-height: 300px;
  overflow-y: auto;
}

.logic-section-inline {
  margin-bottom: 12px;

  &:last-child {
    margin-bottom: 0;
  }
}

.logic-title-inline {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 5px;
}

.logic-section-inline ul {
  margin: 0;
  padding-left: 20px;
  font-size: 13px;
  color: #4b5563;

  li {
    margin-bottom: 3px;
  }
}

.chart-version-toggle {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.chart-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.backplay-toggle {
  display: flex;
  align-items: center;
  gap: 12px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  color: #374151;

  input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }
}

.backplay-status {
  padding: 4px 12px;
  background: #f3f4f6;
  color: #6b7280;
  border-radius: 12px;
  font-size: 12px;

  &.success {
    background: #dcfce7;
    color: #166534;
  }
}

.version-btn {
  padding: 8px 16px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;

  &:hover {
    background: #f9fafb;
  }

  &.active {
    background: #3b82f6;
    color: white;
    border-color: #3b82f6;
  }
}

.data-warning {
  padding: 0.75rem 1rem;
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-radius: 6px;
  margin-bottom: 1rem;
  color: #92400e;
  font-size: 0.9rem;
}

.dialog-content {
  max-height: 80vh;
  overflow-y: auto;
}
</style>
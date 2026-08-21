<template>
  <div class="backtest-detail-page">
    <button class="back-btn" @click="goBack">← 返回</button>

    <div v-if="loading" class="state">加载中...</div>
    <div v-else-if="error" class="state error">{{ error }}</div>

    <template v-else>
      <!-- Header -->
      <div class="page-header">
        <h2>{{ strategy }} / {{ symbol }}</h2>
        <p v-if="result">
          回测区间: {{ result.config?.start_date ?? '?' }} ~ {{ result.config?.end_date ?? '?' }}
          <span v-if="btDate"> | 运行: {{ formatDate(btDate) }} {{ formatTime(btTime) }}</span>
        </p>
      </div>

      <!-- Equity + Price Chart -->
      <div class="chart-section">
        <div v-if="equityData.length" ref="chartContainer" class="chart-container" />
        <div v-else class="chart-empty">
          <p>无权益曲线数据</p>
          <p class="chart-empty-hint">请检查 backtest_equity.csv 是否存在于 {{ dataBase }}/{{ btPath }}/</p>
        </div>
      </div>

      <!-- Detail Info Cards -->
      <div v-if="result" class="detail-cards">
        <!-- 基本信息 -->
        <div class="detail-card">
          <h4>基本信息</h4>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">策略</span>
              <b class="info-value">{{ strategy }}</b>
            </div>
            <div class="info-item">
              <span class="info-label">标的</span>
              <b class="info-value">{{ formatSymbol(symbol) }}</b>
            </div>
            <div class="info-item">
              <span class="info-label">初始资金</span>
              <b class="info-value">{{ fmtNum(result.config?.initial_cash, 0) }}</b>
            </div>
            <div class="info-item">
              <span class="info-label">最终权益</span>
              <b class="info-value">{{ fmtNum(result.accounts?.[0]?.total_equity, 2) }}</b>
            </div>
            <div class="info-item">
              <span class="info-label">峰值权益</span>
              <b class="info-value">{{ fmtNum(result.accounts?.[0]?.peak_equity, 2) }}</b>
            </div>
            <div class="info-item">
              <span class="info-label">状态</span>
              <b class="info-value">{{ result.status ?? '-' }}</b>
            </div>
            <div class="info-item">
              <span class="info-label">耗时</span>
              <b class="info-value">{{ fmtDuration(result.duration_seconds) }}</b>
            </div>
            <div class="info-item">
              <span class="info-label">K线数</span>
              <b class="info-value">{{ fmtInt(result.klines_processed) }}</b>
            </div>
          </div>
        </div>

        <!-- 收益与风险 -->
        <div class="detail-card">
          <h4>收益与风险</h4>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">ROE</span>
              <b class="info-value" :class="pctClass(result.metrics?.roe)">{{ fmtPct(result.metrics?.roe) }}</b>
            </div>
            <div class="info-item">
              <span class="info-label">总收益</span>
              <b class="info-value" :class="pctClass(result.metrics?.total_return)">{{ fmtPct(result.metrics?.total_return) }}</b>
            </div>
            <div class="info-item">
              <span class="info-label">年化收益</span>
              <b class="info-value" :class="pctClass(result.metrics?.annualized_return)">{{ fmtPct(result.metrics?.annualized_return) }}</b>
            </div>
            <div class="info-item">
              <span class="info-label">夏普比率</span>
              <b class="info-value">{{ fmtNum(result.metrics?.sharpe_ratio, 2) }}</b>
            </div>
            <div class="info-item">
              <span class="info-label">索提诺比率</span>
              <b class="info-value">{{ fmtNum(result.metrics?.sortino_ratio, 2) }}</b>
            </div>
            <div class="info-item">
              <span class="info-label">最大回撤</span>
              <b class="info-value val-danger">{{ fmtPct(result.metrics?.max_drawdown) }}</b>
            </div>
            <div class="info-item">
              <span class="info-label">胜率</span>
              <b class="info-value" :class="winRateClass(result.metrics?.win_rate)">{{ fmtPct(result.metrics?.win_rate) }}</b>
            </div>
            <div class="info-item">
              <span class="info-label">盈亏比</span>
              <b class="info-value">{{ fmtNum(result.metrics?.profit_factor, 2) }}</b>
            </div>
          </div>
        </div>

        <!-- 交易统计 -->
        <div class="detail-card">
          <h4>交易统计</h4>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">交易次数</span>
              <b class="info-value">{{ fmtInt(result.trades_count) }}</b>
            </div>
            <div class="info-item">
              <span class="info-label">信号数</span>
              <b class="info-value">{{ fmtInt(result.signals_processed) }}</b>
            </div>
            <div class="info-item">
              <span class="info-label">总交易数</span>
              <b class="info-value">{{ fmtInt(result.metrics?.total_trades) }}</b>
            </div>
            <div class="info-item">
              <span class="info-label">盈利交易</span>
              <b class="info-value val-positive">{{ fmtInt(result.metrics?.winning_trades) }}</b>
            </div>
            <div class="info-item">
              <span class="info-label">亏损交易</span>
              <b class="info-value val-negative">{{ fmtInt(result.metrics?.losing_trades) }}</b>
            </div>
            <div class="info-item">
              <span class="info-label">平均交易盈亏</span>
              <b class="info-value">{{ fmtNum(result.metrics?.avg_trade_pnl, 2) }}</b>
            </div>
            <div class="info-item">
              <span class="info-label">最大盈利</span>
              <b class="info-value val-positive">{{ fmtNum(result.metrics?.largest_win, 2) }}</b>
            </div>
            <div class="info-item">
              <span class="info-label">最大亏损</span>
              <b class="info-value val-negative">{{ fmtNum(result.metrics?.largest_loss, 2) }}</b>
            </div>
            <div class="info-item">
              <span class="info-label">平均盈利</span>
              <b class="info-value">{{ fmtNum(result.metrics?.avg_win, 2) }}</b>
            </div>
            <div class="info-item">
              <span class="info-label">平均亏损</span>
              <b class="info-value">{{ fmtNum(result.metrics?.avg_loss, 2) }}</b>
            </div>
            <div class="info-item">
              <span class="info-label">交易天数</span>
              <b class="info-value">{{ fmtInt(result.metrics?.trading_days) }}</b>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Plotly, { type Data, type Layout, type Config } from 'plotly.js-dist-min'
import {
  getBacktestResult,
  getBacktestEquity,
  getDailyKlineClose,
  BACKTEST_BASE,
  REPLAY_BASE,
} from '@/api/backtest'
import { formatSymbol } from '@/utils/display'
import type { BacktestResult } from '@/models/backtest'
import type { EquityPoint, DailyClosePoint } from '@/api/backtest'

const props = defineProps<{
  strategy: string
  symbol: string
}>()

const route = useRoute()
const router = useRouter()

const btPath = route.query.path as string
const btDate = route.query.date as string
const btTime = route.query.time as string
/**
 * 数据来源：'replay' 来自「每日回放」（/data），其余为「策略发现」（/backtest-output）。
 *
 * 两处的叶子目录结构与文件格式完全相同，故共用本页面，只需切换数据根。
 */
const isReplay = route.query.source === 'replay'
const dataBase = isReplay ? REPLAY_BASE : BACKTEST_BASE

const loading = ref(true)
const error = ref('')
const result = ref<BacktestResult | null>(null)
const equityData = ref<EquityPoint[]>([])
const priceData = ref<DailyClosePoint[]>([])
const chartContainer = ref<HTMLElement | null>(null)

async function loadData() {
  loading.value = true
  error.value = ''
  try {
    // Step 1: fetch result first to get date range for price query
    const res = await getBacktestResult(btPath, dataBase)
    result.value = res

    const startDate = res?.config?.start_date ?? '2020-01-01'
    const endDate = res?.config?.end_date ?? '2030-12-31'

    // Step 2: fetch equity and price in parallel
    const [equity, price] = await Promise.all([
      getBacktestEquity(btPath, dataBase),
      getDailyKlineClose(props.symbol, startDate, endDate),
    ])
    equityData.value = equity
    priceData.value = price
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }

  // After loading=false, the chart container will be in the DOM on next tick
  await nextTick()
  renderChart()
}

function renderChart() {
  if (!chartContainer.value || equityData.value.length === 0) return

  const dates = equityData.value.map(p => p.date)
  const equity = equityData.value.map(p => p.equity)

  // Calculate drawdown from peak equity
  let peak = equity[0]
  const drawdown: number[] = []
  for (const e of equity) {
    if (e > peak) peak = e
    drawdown.push(peak > 0 ? ((e - peak) / peak) * 100 : 0)
  }

  const hasPrice = priceData.value.length > 0

  // --- Traces ---
  const traces: Data[] = [
    // Equity curve (top subplot, yaxis: 'y')
    {
      x: dates,
      y: equity,
      name: 'Equity',
      type: 'scatter',
      mode: 'lines',
      line: { color: '#3b82f6', width: 2 },
      yaxis: 'y',
      fill: 'tozeroy',
      fillcolor: 'rgba(59, 130, 246, 0.08)',
    },
    // Drawdown (bottom subplot, yaxis: 'y3')
    {
      x: dates,
      y: drawdown,
      name: 'Drawdown',
      type: 'scatter',
      mode: 'lines',
      line: { color: '#ef4444', width: 1.5 },
      yaxis: 'y3',
      fill: 'tozeroy',
      fillcolor: 'rgba(239, 68, 68, 0.15)',
    },
  ]

  if (hasPrice) {
    traces.push({
      x: priceData.value.map(p => p.date),
      y: priceData.value.map(p => p.close),
      name: 'Price',
      type: 'scatter',
      mode: 'lines',
      line: { color: '#9ca3af', width: 1 },
      yaxis: 'y2',
    })
  }

  // --- Layout: 2-row subplot ---
  // Row 1: Equity (y) + Price (y2) — shared xaxis
  // Row 2: Drawdown (y3) — xaxis2 linked to xaxis
  const y2Config: Record<string, unknown> = hasPrice
    ? {
        title: 'Price',
        side: 'right',
        overlaying: 'y',
        gridcolor: '#fef3c7',
      }
    : {}

  const layout: Partial<Layout> = {
    title: { text: 'Equity Curve & Drawdown', font: { size: 16 } },
    height: 560,
    margin: { l: 70, r: 70, t: 40, b: 50 },
    grid: {
      rows: 2,
      columns: 1,
      pattern: 'independent',
      roworder: 'top to bottom',
    },
    // Top subplot x/y
    xaxis: {
      type: 'date',
      rangeslider: { visible: false },
    },
    yaxis: {
      title: 'Equity',
      side: 'left',
      gridcolor: '#f0f0f0',
      domain: [0.28, 1],
    },
    // Price on right of top subplot
    yaxis2: {
      ...y2Config,
      domain: [0.28, 1],
    },
    // Bottom subplot: drawdown
    xaxis2: {
      type: 'date',
      matches: 'x',
    },
    yaxis3: {
      title: 'Drawdown %',
      side: 'left',
      gridcolor: '#fee2e2',
      domain: [0, 0.22],
      zeroline: true,
      zerolinecolor: '#d1d5db',
    },
    legend: { orientation: 'h', y: 1.12 },
    dragmode: 'zoom',
    hovermode: 'x unified',
  }

  const config: Partial<Config> = {
    responsive: true,
    scrollZoom: true,
    doubleClick: 'reset+autosize',
    displaylogo: false,
    modeBarButtonsToRemove: ['lasso2d', 'select2d'],
  }

  Plotly.newPlot(chartContainer.value, traces, layout, config)
}

// ---- Formatting helpers ----
function pctClass(v: number | undefined | null): string {
  if (v == null || Number.isNaN(v)) return ''
  return v > 0 ? 'val-positive' : v < 0 ? 'val-negative' : ''
}

function winRateClass(v: number | undefined | null): string {
  if (v == null || Number.isNaN(v)) return ''
  return v >= 0.5 ? 'val-positive' : 'val-negative'
}

function fmtPct(v: number | undefined | null): string {
  if (v == null || Number.isNaN(v)) return '-'
  return (v * 100).toFixed(2) + '%'
}

function fmtNum(v: number | undefined | null, digits = 2): string {
  if (v == null || Number.isNaN(v)) return '-'
  return v.toFixed(digits)
}

function fmtInt(v: number | undefined | null): string {
  if (v == null || Number.isNaN(v)) return '-'
  return String(Math.round(v))
}

function formatDate(date: string): string {
  if (!date || date.length !== 8) return date || '-'
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
}

function formatTime(time: string): string {
  if (!time || time.length !== 6) return time || ''
  return `${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}`
}

function fmtDuration(v: number | undefined | null): string {
  if (v == null || Number.isNaN(v)) return '-'
  const min = Math.round(v / 60)
  if (min < 60) return `${min} 分钟`
  return `${Math.floor(min / 60)} 小时 ${min % 60} 分钟`
}

function goBack() {
  if (window.history.length > 1) {
    router.back()
    return
  }
  // 无历史时回到来源 tab，而非固定的策略发现
  router.push({ path: '/', query: { tab: isReplay ? 'replay' : 'backtest' } })
}

onMounted(loadData)
</script>

<style scoped lang="scss">
.backtest-detail-page {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  box-sizing: border-box;
}

.back-btn {
  background: none;
  border: none;
  color: #3b82f6;
  font-size: 14px;
  cursor: pointer;
  padding: 8px 0;
  margin-bottom: 16px;

  &:hover {
    text-decoration: underline;
  }
}

.page-header {
  background: white;
  padding: 20px 24px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  margin-bottom: 20px;

  h2 {
    margin: 0 0 6px;
    font-size: 22px;
    color: #1a1a1a;
  }

  p {
    margin: 0;
    font-size: 14px;
    color: #6b7280;
  }
}

.chart-section {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  padding: 20px;
  margin-bottom: 20px;
}

.chart-container {
  width: 100%;
  min-height: 560px;
}

.state {
  padding: 40px;
  text-align: center;
  color: #6b7280;

  &.error {
    color: #dc2626;
  }
}

.chart-empty {
  padding: 40px;
  text-align: center;
  color: #6b7280;

  p {
    margin: 4px 0;
  }

  .chart-empty-hint {
    font-size: 12px;
    color: #9ca3af;
    word-break: break-all;
  }
}

.detail-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 16px;
}

.detail-card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  padding: 20px;

  h4 {
    margin: 0 0 16px;
    font-size: 16px;
    color: #1a1a1a;
    padding-bottom: 10px;
    border-bottom: 2px solid #f3f4f6;
  }
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.info-item {
  background: #f9fafb;
  border-radius: 8px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-label {
  font-size: 12px;
  color: #6b7280;
}

.info-value {
  font-size: 15px;
  color: #1f2937;
}

.val-positive {
  color: #16a34a !important;
}

.val-negative {
  color: #dc2626 !important;
}

.val-danger {
  color: #dc2626 !important;
}
</style>

<template>
  <div ref="chartContainer" class="technical-chart"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onBeforeUnmount } from 'vue'
import Plotly from 'plotly.js-dist-min'
import type { Data, Layout, Config } from 'plotly.js-dist-min'
import {
  createIndicators,
  type IndicatorType,
  type KlinePoint,
  type IndicatorResult,
  INDICATOR_COLORS,
  STRATEGY_INDICATOR_CONFIG,
} from '@/indicators'
import type { BacktestSignal } from '@/models/backtest'

interface Props {
  klineData: KlinePoint[]
  strategy?: string
  symbol?: string
  indicators?: IndicatorType[]
  displayCount?: number
  backplaySignals?: BacktestSignal[]
}

const props = withDefaults(defineProps<Props>(), {
  strategy: '',
  symbol: '',
  indicators: () => ['RSI', 'MACD', 'ATR'] as IndicatorType[],
  displayCount: 100,
})

const emit = defineEmits<{
  entryClick: [entry: { position_id: string; position_type: string; entry_price: number; datetime: string }]
  exitClick: [exit: { position_id: string; position_type: string; exit_price: number; datetime: string }]
}>()

const chartContainer = ref<HTMLDivElement>()

onMounted(() => {
  renderChart()
})

watch([() => props.klineData, () => props.strategy, () => props.indicators, () => props.displayCount, () => props.backplaySignals], () => {
  renderChart()
}, { deep: true })

function getIndicatorParams(strategyName: string) {
  const config = STRATEGY_INDICATOR_CONFIG[strategyName]
  if (!config) return {}
  return config.params
}

function renderChart() {
  if (!chartContainer.value || props.klineData.length === 0) return

  // 使用全量数据，不截断
  const displayData = props.klineData
  const timestamps = displayData.map(d => d.datetime)
  const indicatorParams = getIndicatorParams(props.strategy)
  const indicators = createIndicators(props.indicators, indicatorParams)

  // 将回放信号时间对齐到K线周期
  const alignBackplayTime = (signalTime: string): string => {
    // 从K线数据推断时间周期（比较前两根K线的时间差）
    if (displayData.length < 2) return signalTime

    const t1 = new Date(displayData[0].datetime).getTime()
    const t2 = new Date(displayData[1].datetime).getTime()
    const intervalMs = Math.abs(t2 - t1)

    // 将信号时间对齐到周期起始时间
    const signalTimestamp = new Date(signalTime).getTime()
    const alignedTimestamp = Math.floor(signalTimestamp / intervalMs) * intervalMs

    // 格式化为 "YYYY-MM-DD HH:MM:SS"
    const alignedDate = new Date(alignedTimestamp)
    const year = alignedDate.getFullYear()
    const month = String(alignedDate.getMonth() + 1).padStart(2, '0')
    const day = String(alignedDate.getDate()).padStart(2, '0')
    const hour = String(alignedDate.getHours()).padStart(2, '0')
    const minute = String(alignedDate.getMinutes()).padStart(2, '0')
    const second = '00'

    return `${year}-${month}-${day} ${hour}:${minute}:${second}`
  }

  const traces: Data[] = []

  // Compute indicators first to get values for hover text
  const indicatorValues: Record<string, IndicatorResult> = {}
  for (const indicator of indicators) {
    const result = indicator.compute(displayData)
    indicatorValues[indicator.name] = result
  }

  // Build hover text for candlestick (basic info only)
  const candleHoverText = displayData.map((d) => {
    const parts = [
      `时间: ${d.datetime}`,
      `开: ${d.open.toFixed(2)}`,
      `高: ${d.high.toFixed(2)}`,
      `低: ${d.low.toFixed(2)}`,
      `收: ${d.close.toFixed(2)}`,
    ]
    return parts.join('<br>')
  })

  // Candlestick trace
  const candlestick = {
    x: timestamps,
    open: displayData.map(d => d.open),
    high: displayData.map(d => d.high),
    low: displayData.map(d => d.low),
    close: displayData.map(d => d.close),
    type: 'candlestick',
    name: 'K线',
    increasing: { line: { color: INDICATOR_COLORS.bullish } },
    decreasing: { line: { color: INDICATOR_COLORS.bearish } },
    xaxis: 'x',
    yaxis: 'y',
    showlegend: false,
    hovertext: candleHoverText,
    hoverinfo: 'text',
  } as Data
  traces.push(candlestick)

  // Entry/Exit markers with indicator values
  // 展开所有开仓点：重采样后一根K线上可能有多个开仓点
  const entryPoints: Array<{
    position_id: string
    position_type: 'long' | 'short'
    entry_price: number
    datetime: string
    entry_time?: string
    klineIndex: number
  }> = []
  for (let i = 0; i < displayData.length; i++) {
    const d = displayData[i]
    if (d.entries && d.entries.length > 0) {
      // 使用 entries 数组（重采样后一根K线可能有多个开仓点）
      for (const entry of d.entries) {
        entryPoints.push({
          position_id: entry.position_id,
          position_type: entry.position_type,
          entry_price: entry.entry_price,
          datetime: d.datetime,
          entry_time: entry.entry_time,
          klineIndex: i,
        })
      }
    } else if (d.is_entry) {
      // 1分钟数据没有 entries 数组，使用单值字段
      entryPoints.push({
        position_id: d.position_id,
        position_type: d.position_type,
        entry_price: d.entry_price,
        datetime: d.datetime,
        entry_time: d.entry_time,
        klineIndex: i,
      })
    }
  }
  // 展开所有平仓点：重采样后一根K线上可能有多个平仓点
  const exitPoints: Array<{
    position_id: string
    position_type: 'long' | 'short'
    exit_price: number
    datetime: string
    exit_time?: string
    klineIndex: number
  }> = []
  for (let i = 0; i < displayData.length; i++) {
    const d = displayData[i]
    if (d.exits && d.exits.length > 0) {
      for (const ex of d.exits) {
        exitPoints.push({
          position_id: ex.position_id,
          position_type: ex.position_type,
          exit_price: ex.exit_price,
          datetime: d.datetime,
          exit_time: ex.exit_time,
          klineIndex: i,
        })
      }
    } else if (d.is_exit) {
      exitPoints.push({
        position_id: d.position_id,
        position_type: d.position_type,
        exit_price: d.close,
        datetime: d.datetime,
        exit_time: d.exit_time,
        klineIndex: i,
      })
    }
  }

  // Helper function to get indicator values at a specific index
  function getIndicatorText(index: number): string {
    const parts: string[] = []
    for (const [indicatorName, result] of Object.entries(indicatorValues)) {
      const valueStrs: string[] = []
      for (const [key, values] of Object.entries(result)) {
        const value = values[index]
        if (value !== null && value !== undefined) {
          // Skip threshold lines
          if (!key.includes('_upper') && !key.includes('_lower') && !key.includes('_threshold')) {
            valueStrs.push(`${key}: ${value.toFixed(2)}`)
          }
        }
      }
      if (valueStrs.length > 0) {
        parts.push(`${indicatorName}: ${valueStrs.join(', ')}`)
      }
    }
    return parts.join('<br>')
  }

  // Entry points (开仓点) - 显示技术指标值
  if (entryPoints.length > 0) {
    const entryTexts = entryPoints.map(ep => {
      const indicatorText = getIndicatorText(ep.klineIndex)
      // 使用 entry_time（精确时间）或 fallback 到 datetime
      const timeDisplay = ep.entry_time || ep.datetime
      const parts = [
        `<b>${ep.position_type === 'long' ? '做多开仓' : '做空开仓'}</b>`,
        `价格: ${ep.entry_price.toFixed(2)}`,
        `时间: ${timeDisplay}`,
      ]
      if (indicatorText) {
        parts.push('--- 技术指标 ---')
        parts.push(indicatorText)
      }
      return parts.join('<br>')
    })

    traces.push({
      x: entryPoints.map(ep => ep.datetime),
      y: entryPoints.map(ep => ep.entry_price),
      type: 'scatter',
      mode: 'markers+text',
      name: '开仓点',
      marker: {
        symbol: 'circle',
        size: 14,
        color: entryPoints.map(ep => ep.position_type === 'long' ? '#22c55e' : '#ef4444'),
        line: { width: 2, color: 'white' },
      },
      text: entryPoints.map(ep => ep.position_type === 'long' ? 'B' : 'S'),
      textposition: 'top center',
      textfont: {
        size: 14,
        color: entryPoints.map(ep => ep.position_type === 'long' ? '#22c55e' : '#ef4444'),
        family: 'Arial Black',
      },
      hovertext: entryTexts,
      hoverinfo: 'text',
      xaxis: 'x',
      yaxis: 'y',
    } as Data)
  }

  // Exit points (平仓点) - 显示技术指标值
  if (exitPoints.length > 0) {
    const exitTexts = exitPoints.map(ep => {
      const indicatorText = getIndicatorText(ep.klineIndex)
      // 使用 exit_time（精确时间）或 fallback 到 datetime
      const timeDisplay = ep.exit_time || ep.datetime
      const parts = [
        `<b>平仓</b>`,
        `价格: ${ep.exit_price.toFixed(2)}`,
        `时间: ${timeDisplay}`,
      ]
      if (indicatorText) {
        parts.push('--- 技术指标 ---')
        parts.push(indicatorText)
      }
      return parts.join('<br>')
    })

    traces.push({
      x: exitPoints.map(ep => ep.datetime),
      y: exitPoints.map(ep => ep.exit_price),
      type: 'scatter',
      mode: 'markers',
      name: '平仓点',
      marker: {
        symbol: 'x',
        size: 12,
        color: '#f59e0b',
        line: { width: 2, color: 'white' },
      },
      hovertext: exitTexts,
      hoverinfo: 'text',
      xaxis: 'x',
      yaxis: 'y',
    } as Data)
  }

  // Backplay signals (回放信号) - 使用不同的标记样式区分实盘
  if (props.backplaySignals && props.backplaySignals.length > 0) {
    const backplayEntries = props.backplaySignals.filter(s => s.action === 'open')
    const backplayExits = props.backplaySignals.filter(s => s.action === 'close')

    // 回放开仓点 - 使用菱形标记
    if (backplayEntries.length > 0) {
      traces.push({
        x: backplayEntries.map(s => alignBackplayTime(s.datetime)),
        y: backplayEntries.map(s => s.price),
        type: 'scatter',
        mode: 'markers+text',
        name: '回放开仓',
        marker: {
          symbol: 'diamond',
          size: 12,
          color: backplayEntries.map(s => s.position_type === 'long' ? '#3b82f6' : '#f97316'),
          line: { width: 2, color: 'white' },
        },
        text: backplayEntries.map(s => s.position_type === 'long' ? 'B' : 'S'),
        textposition: 'bottom center',
        textfont: {
          size: 12,
          color: backplayEntries.map(s => s.position_type === 'long' ? '#3b82f6' : '#f97316'),
          family: 'Arial Black',
        },
        hovertext: backplayEntries.map(s =>
          `<b>回放${s.position_type === 'long' ? '做多' : '做空'}开仓</b><br>价格: ${s.price.toFixed(2)}<br>时间: ${s.datetime}`
        ),
        hoverinfo: 'text',
        xaxis: 'x',
        yaxis: 'y',
      } as Data)
    }

    // 回放平仓点 - 使用正方形标记
    if (backplayExits.length > 0) {
      traces.push({
        x: backplayExits.map(s => alignBackplayTime(s.datetime)),
        y: backplayExits.map(s => s.price),
        type: 'scatter',
        mode: 'markers',
        name: '回放平仓',
        marker: {
          symbol: 'square',
          size: 10,
          color: '#9333ea',
          line: { width: 2, color: 'white' },
        },
        hovertext: backplayExits.map(s =>
          `<b>回放平仓</b><br>价格: ${s.price.toFixed(2)}<br>时间: ${s.datetime}`
        ),
        hoverinfo: 'text',
        xaxis: 'x',
        yaxis: 'y',
      } as Data)
    }
  }

  // Collect subplot configs
  const subplotConfigs: { name: string; yaxis: string; range?: [number, number] }[] = []
  let subplotIndex = 2

  // Add indicator traces (already computed above)
  for (const indicator of indicators) {
    const result = indicatorValues[indicator.name]
    const indicatorTraces = indicator.getTraces(result, timestamps, INDICATOR_COLORS)

    if (indicator.subplot) {
      const yaxisName = `y${subplotIndex}`
      subplotConfigs.push({
        name: indicator.name,
        yaxis: yaxisName,
        range: indicator.getYAxisConfig?.()?.range,
      })
      subplotIndex++

      for (const trace of indicatorTraces) {
        traces.push({
          ...trace,
          yaxis: yaxisName,
        } as Data)
      }
    } else {
      for (const trace of indicatorTraces) {
        traces.push(trace as Data)
      }
    }
  }

  // Build layout - 手动 domain 布局，确保交互可用

  const numSubplots = subplotConfigs.length
  const gap = 0.02
  const timeLabelSpace = 0.08 // 为底部时间标签预留空间

  // 布局比例：主图 50%，时间标签空间 8%，子图平分剩余 42%
  const mainChartHeight = 0.50
  const subplotHeight = numSubplots > 0 ? (1 - mainChartHeight - timeLabelSpace - gap * numSubplots) / numSubplots : 0

  // 找到第一个开仓点的位置
  const firstEntryIndex = displayData.findIndex(d => d.is_entry)
  const startIdx = firstEntryIndex >= 0
    ? Math.max(0, firstEntryIndex - Math.floor(props.displayCount / 2))
    : 0
  const endIdx = Math.min(startIdx + props.displayCount - 1, timestamps.length - 1)

  const layout: Partial<Layout> = {
    title: {
      text: props.strategy && props.symbol
        ? `${props.strategy} - ${props.symbol}`
        : props.strategy || props.symbol || '技术指标图表',
      font: { size: 16 },
    },
    // 主图的 x 轴配置 - 不显示时间标签
    xaxis: {
      domain: [0, 1],
      rangeslider: { visible: false },
      type: 'category',
      tickangle: -45,
      tickfont: { size: 9 },
      nticks: 8,
      showticklabels: false, // 主图不显示时间标签
      // 设置初始显示范围：以第一个开仓点为中心
      range: [startIdx, endIdx],
    },
    yaxis: {
      domain: [1 - mainChartHeight, 1],
      title: '价格',
      titlefont: { size: 12 },
    },
    height: 900,
    margin: { l: 60, r: 40, b: 60, t: 50, pad: 4 },
    showlegend: true,
    legend: { orientation: 'h', y: 1.02, font: { size: 10 } },
    dragmode: 'pan',
    hovermode: 'x unified',
  }

  // Add subplot y-axes - 从底部向上排列
  let currentBottom = 0
  for (let i = 0; i < subplotConfigs.length; i++) {
    const config = subplotConfigs[i]
    const yaxisKey = `yaxis${i + 2}`
    const xaxisKey = `xaxis${i + 2}`
    const top = currentBottom + subplotHeight
    const isLastSubplot = i === numSubplots - 1

    ;(layout as Record<string, unknown>)[yaxisKey] = {
      domain: [currentBottom, top],
      title: { text: config.name, font: { size: 11 } },
      range: config.range,
      tickfont: { size: 9 },
    }

    // 只有最底部的子图显示时间标签
    ;(layout as Record<string, unknown>)[xaxisKey] = {
      domain: [0, 1],
      type: 'category',
      tickangle: -45,
      tickfont: { size: 9 },
      nticks: 8,
      showticklabels: isLastSubplot, // 只有最底部子图显示时间标签
      matches: 'x', // 所有 x 轴同步
    }

    currentBottom = top + gap
  }

  const config: Partial<Config> = {
    responsive: true,
    displayModeBar: true,
    scrollZoom: true,
    doubleClick: 'reset',
    displaylogo: false,
    modeBarButtonsToRemove: ['lasso2d', 'select2d'],
  }

  Plotly.newPlot(chartContainer.value, traces, layout, config)

  // 添加点击事件监听
  if (chartContainer.value) {
    chartContainer.value.on('plotly_click', (eventData: { points: Array<{ curveNumber: number; pointNumber: number; x: string; y: number }> }) => {
      const point = eventData.points[0]
      if (!point) return

      // curveNumber 对应 traces 数组中的索引：
      // 0 = candlestick, 1 = 开仓点, 2 = 平仓点（可能不存在）
      const entryCurveIndex = 1
      const exitCurveIndex = entryPoints.length > 0 ? 2 : 1

      if (point.curveNumber === entryCurveIndex && entryPoints.length > 0) {
        // 点击开仓点
        const entryPoint = entryPoints[point.pointNumber]
        if (entryPoint) {
          emit('entryClick', {
            position_id: entryPoint.position_id,
            position_type: entryPoint.position_type,
            entry_price: entryPoint.entry_price,
            datetime: entryPoint.entry_time || entryPoint.datetime
          })
        }
      } else if (point.curveNumber === exitCurveIndex && exitPoints.length > 0) {
        // 点击平仓点
        const exitPoint = exitPoints[point.pointNumber]
        if (exitPoint) {
          emit('exitClick', {
            position_id: exitPoint.position_id,
            position_type: exitPoint.position_type,
            exit_price: exitPoint.exit_price,
            datetime: exitPoint.exit_time || exitPoint.datetime
          })
        }
      }
    })
  }
}

onBeforeUnmount(() => {
  if (chartContainer.value) {
    Plotly.purge(chartContainer.value)
  }
})
</script>

<style scoped>
.technical-chart {
  width: 100%;
  min-height: 900px;
}
</style>

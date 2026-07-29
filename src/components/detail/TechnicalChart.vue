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

interface Props {
  klineData: KlinePoint[]
  strategy?: string
  symbol?: string
  indicators?: IndicatorType[]
  displayCount?: number
}

const props = withDefaults(defineProps<Props>(), {
  strategy: '',
  symbol: '',
  indicators: () => ['RSI', 'MACD', 'ATR'] as IndicatorType[],
  displayCount: 100,
})

const chartContainer = ref<HTMLDivElement>()

onMounted(() => {
  renderChart()
})

watch([() => props.klineData, () => props.strategy, () => props.indicators, () => props.displayCount], () => {
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
  const candlestick: Data = {
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
  }
  traces.push(candlestick)

  // Entry/Exit markers with indicator values
  const entryPoints = displayData.filter(d => d.is_entry)
  const exitPoints = displayData.filter(d => d.is_exit)

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
    const entryTexts = entryPoints.map(d => {
      const idx = displayData.findIndex(k => k.datetime === d.datetime)
      const indicatorText = idx >= 0 ? getIndicatorText(idx) : ''
      const parts = [
        `<b>${d.position_type === 'long' ? '做多开仓' : '做空开仓'}</b>`,
        `价格: ${d.entry_price!.toFixed(2)}`,
        `时间: ${d.datetime}`,
      ]
      if (indicatorText) {
        parts.push('--- 技术指标 ---')
        parts.push(indicatorText)
      }
      return parts.join('<br>')
    })

    traces.push({
      x: entryPoints.map(d => d.datetime),
      y: entryPoints.map(d => d.entry_price!),
      type: 'scatter',
      mode: 'markers+text',
      name: '开仓点',
      marker: {
        symbol: 'circle',
        size: 14,
        color: entryPoints.map(d => d.position_type === 'long' ? '#22c55e' : '#ef4444'),
        line: { width: 2, color: 'white' },
      },
      text: entryPoints.map(d => d.position_type === 'long' ? 'B' : 'S'),
      textposition: 'top center',
      textfont: {
        size: 14,
        color: entryPoints.map(d => d.position_type === 'long' ? '#22c55e' : '#ef4444'),
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
    const exitTexts = exitPoints.map(d => {
      const idx = displayData.findIndex(k => k.datetime === d.datetime)
      const indicatorText = idx >= 0 ? getIndicatorText(idx) : ''
      const parts = [
        `<b>平仓</b>`,
        `价格: ${d.close.toFixed(2)}`,
        `ROI: ${d.pnl_pct!.toFixed(2)}%`,
        `时间: ${d.datetime}`,
      ]
      if (indicatorText) {
        parts.push('--- 技术指标 ---')
        parts.push(indicatorText)
      }
      return parts.join('<br>')
    })

    traces.push({
      x: exitPoints.map(d => d.datetime),
      y: exitPoints.map(d => d.close),
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

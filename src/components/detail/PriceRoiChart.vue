<template>
  <div class="price-roi-chart">
    <div class="chart-header">
      <h3>价格与ROI趋势</h3>
    </div>
    <div ref="chartRef" class="chart-container" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'
import type { KlinePoint } from '@/models/kline'

const props = defineProps<{
  timelineData?: KlinePoint[]
}>()

const chartRef = ref<HTMLElement>()
let chartInstance: echarts.ECharts | null = null

const ROI_COLORS = ['#8B5CF6', '#F59E0B', '#10B981', '#EF4444', '#3B82F6', '#EC4899']

interface PositionGroup {
  id: string
  label: string
  type: 'long' | 'short'
  roiMap: Map<number, number>
  entryIndex: number | null
  exitIndex: number | null
  entryPrice: number
}

function buildChartData() {
  const data = props.timelineData || []
  if (data.length === 0) return { times: [], priceData: [], positions: [] }

  const timeList: string[] = []
  const timeSet = new Set<string>()
  const priceMap = new Map<string, number>()

  for (const d of data) {
    const key = d.datetime?.slice(11, 16) || ''
    if (!timeSet.has(key)) {
      timeSet.add(key)
      timeList.push(key)
      priceMap.set(key, d.close)
    }
  }

  const priceData = timeList.map(t => priceMap.get(t) || 0)
  const timeIndexMap = new Map(timeList.map((t, i) => [t, i]))

  const groupMap = new Map<string, PositionGroup>()
  for (const d of data) {
    const pid = d.position_id || 'default'
    if (!groupMap.has(pid)) {
      const shortId = pid.split('_').slice(-1)[0] || pid
      const label = `${d.position_type === 'short' ? '空' : '多'} #${shortId}`
      groupMap.set(pid, {
        id: pid,
        label,
        type: d.position_type,
        roiMap: new Map(),
        entryIndex: null,
        exitIndex: null,
        entryPrice: d.entry_price,
      })
    }

    const group = groupMap.get(pid)!
    const timeKey = d.datetime?.slice(11, 16) || ''
    const idx = timeIndexMap.get(timeKey)
    if (idx !== undefined) {
      group.roiMap.set(idx, d.pnl_pct)
    }

    if (d.is_entry && group.entryIndex === null) {
      group.entryIndex = idx ?? null
    }
    if (d.is_exit) {
      group.exitIndex = idx ?? null
    }
  }

  const positions = Array.from(groupMap.values())
  return { times: timeList, priceData, positions }
}

function initChart() {
  if (!chartRef.value) return

  if (chartInstance) {
    chartInstance.dispose()
  }
  chartInstance = echarts.init(chartRef.value)

  const { times, priceData, positions } = buildChartData()
  if (times.length === 0) return

  const prices = priceData.filter(p => p > 0)
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 100
  const priceRange = maxPrice - minPrice
  const priceMin = Math.max(0, minPrice - priceRange * 0.12)
  const priceMax = maxPrice + priceRange * 0.12

  const series: Record<string, unknown>[] = []

  // 价格线
  series.push({
    name: '价格',
    type: 'line',
    yAxisIndex: 0,
    data: priceData,
    lineStyle: { color: '#3B82F6', width: 2 },
    itemStyle: { color: '#3B82F6' },
    showSymbol: false,
    z: 10,
  })

  positions.forEach((pos, idx) => {
    const color = ROI_COLORS[idx % ROI_COLORS.length]

    // 开仓/平仓标注点（放在 ROI 线上，用 ROI 坐标）
    const markPoints: Record<string, unknown>[] = []

    if (pos.entryIndex !== null) {
      const entryRoi = pos.roiMap.get(pos.entryIndex) ?? 0
      markPoints.push({
        name: `${pos.label} 开仓`,
        coord: [pos.entryIndex, entryRoi],
        symbol: 'triangle',
        symbolSize: 14,
        itemStyle: { color: pos.type === 'long' ? '#10B981' : '#EF4444' },
        label: {
          show: true,
          formatter: `${pos.type === 'long' ? '开多' : '开空'} $${pos.entryPrice.toFixed(2)}`,
          position: 'top',
          fontSize: 10,
          color: pos.type === 'long' ? '#10B981' : '#EF4444',
        },
      })
    }

    if (pos.exitIndex !== null) {
      const exitRoi = pos.roiMap.get(pos.exitIndex) ?? 0
      markPoints.push({
        name: `${pos.label} 平仓`,
        coord: [pos.exitIndex, exitRoi],
        symbol: 'triangle',
        symbolRotate: 180,
        symbolSize: 14,
        itemStyle: { color: '#6B7280' },
        label: {
          show: true,
          formatter: `平仓 ${exitRoi >= 0 ? '+' : ''}${exitRoi.toFixed(2)}%`,
          position: 'bottom',
          fontSize: 10,
          color: '#6B7280',
        },
      })
    }

    // ROI 实线：从第一个有数据点到平仓点（或末尾）
    // 如果有开仓点，从开仓点开始；否则从第一个 ROI 数据点开始
    const solidEnd = pos.exitIndex !== null ? pos.exitIndex : times.length - 1
    const roiSolid: (number | null)[] = new Array(times.length).fill(null)

    // 找到第一个有 ROI 数据的点
    let solidStart = pos.entryIndex
    if (solidStart === null) {
      for (let i = 0; i < times.length; i++) {
        if (pos.roiMap.has(i)) {
          solidStart = i
          break
        }
      }
    }

    if (solidStart !== null) {
      for (let i = solidStart; i <= solidEnd; i++) {
        const val = pos.roiMap.get(i)
        roiSolid[i] = val !== undefined ? val : null
      }
    }

    // ROI 虚线：平仓点之后
    const roiDashed: (number | null)[] = new Array(times.length).fill(null)
    if (pos.exitIndex !== null) {
      roiDashed[pos.exitIndex] = pos.roiMap.get(pos.exitIndex) ?? null
      for (let i = pos.exitIndex + 1; i < times.length; i++) {
        roiDashed[i] = pos.roiMap.get(i) ?? null
      }
    }

    // ROI 实线
    series.push({
      name: pos.label,
      type: 'line',
      yAxisIndex: 1,
      data: roiSolid,
      lineStyle: { color, width: 2, type: 'solid' },
      itemStyle: { color },
      showSymbol: false,
      connectNulls: false,
      markPoint: {
        data: markPoints,
        animation: false,
      },
    })

    // ROI 虚线
    if (pos.exitIndex !== null) {
      series.push({
        name: `${pos.label}(平仓后)`,
        type: 'line',
        yAxisIndex: 1,
        data: roiDashed,
        lineStyle: { color, width: 1.5, type: 'dashed' },
        itemStyle: { color },
        showSymbol: false,
        connectNulls: false,
      })
    }
  })

  const legendData = ['价格', ...positions.map(p => p.label)]

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      formatter(params: unknown) {
        const items = (Array.isArray(params) ? params : [params]) as Record<string, unknown>[]
        let html = ''
        for (const item of items) {
          const name = item.seriesName as string
          const val = item.value as number | null
          if (val === null || val === undefined) continue
          const marker = item.marker as string
          if (name === '价格') {
            html += `${marker} ${name}: $${val.toFixed(2)}<br/>`
          } else if (name.includes('(平仓后)')) {
            html += `${marker} ${name}: ${val.toFixed(4)}%<br/>`
          } else {
            html += `${marker} ${name}: ${val.toFixed(4)}%<br/>`
          }
        }
        return html || '无数据'
      },
    },
    legend: {
      data: legendData,
      top: 0,
    },
    grid: {
      left: '3%',
      right: '4%',
      top: 40,
      bottom: '3%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: times,
      axisLabel: {
        interval: Math.floor(times.length / 8),
        rotate: 0,
      },
    },
    yAxis: [
      {
        type: 'value',
        name: '价格',
        position: 'left',
        min: priceMin,
        max: priceMax,
        axisLabel: { formatter: '${value}' },
      },
      {
        type: 'value',
        name: 'ROI%',
        position: 'right',
        axisLabel: { formatter: '{value}%' },
      },
    ],
    series,
  }

  chartInstance.setOption(option)
}

function resizeChart() {
  chartInstance?.resize()
}

onMounted(() => {
  initChart()
  window.addEventListener('resize', resizeChart)
})

onUnmounted(() => {
  window.removeEventListener('resize', resizeChart)
  chartInstance?.dispose()
})

watch(() => props.timelineData, () => {
  initChart()
}, { deep: true })
</script>

<style scoped lang="scss">
.price-roi-chart {
  margin-bottom: 20px;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;

  h3 {
    margin: 0;
    font-size: 16px;
    color: #303133;
  }
}

.chart-container {
  width: 100%;
  height: 400px;
}
</style>

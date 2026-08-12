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
  highlightPositionId?: string
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
  if (data.length === 0) return { times: [], priceData: [], positions: [], multiDay: false }

  // 每个 bar 在时间轴上独占一个位置（数组下标），不再按 HH:MM 去重——
  // 否则多日数据中不同天的同一时刻会被错误折叠到同一点（开仓点重叠）。
  const dateSet = new Set<string>()
  for (const d of data) {
    const day = d.datetime?.slice(0, 10)
    if (day) dateSet.add(day)
  }
  const multiDay = dateSet.size > 1

  // 单日显示 HH:MM；跨日显示 MM-DD HH:MM
  const timeList = data.map((d) => {
    const dt = d.datetime || ''
    if (multiDay) {
      // "2026-08-07 04:00:00" -> "08-07 04:00"
      return `${dt.slice(5, 10)} ${dt.slice(11, 16)}`
    }
    return dt.slice(11, 16)
  })

  const priceData = data.map((d) => d.close)

  const groupMap = new Map<string, PositionGroup>()
  data.forEach((d, idx) => {
    // 跳过无持仓的中性 bar，不画 default 0 线
    if (!d.position_id) return

    const pid = d.position_id
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
    group.roiMap.set(idx, d.pnl_pct)

    if (d.is_entry && group.entryIndex === null) {
      group.entryIndex = idx
    }
    if (d.is_exit) {
      group.exitIndex = idx
    }
  })

  const positions = Array.from(groupMap.values())
  return { times: timeList, priceData, positions, multiDay }
}

function initChart() {
  if (!chartRef.value) return

  if (chartInstance) {
    chartInstance.dispose()
  }
  chartInstance = echarts.init(chartRef.value)

  const { times, priceData, positions, multiDay } = buildChartData()
  if (times.length === 0) return

  const prices = priceData.filter(p => p > 0)
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 100
  const priceRange = maxPrice - minPrice
  const priceMin = Math.max(0, minPrice - priceRange * 0.12)
  const priceMax = maxPrice + priceRange * 0.12

  // 聚焦的仓位（点击开仓/平仓点打开弹窗时传入）。仅在【多日】场景下把时间轴
  // 缩放到该仓位的持仓窗口——多日全景里单笔持仓只占很窄一段，缩放后价格与 ROI
  // 的波动幅度自然回到可比区间，关联关系随之显现。
  // 单日（每日收益入口）行为完全保持原样，不做任何缩放。
  const highlighted = multiDay ? positions.find(p => p.id === props.highlightPositionId) : undefined
  let zoomStartPct = 0
  let zoomEndPct = 100
  if (highlighted && highlighted.entryIndex !== null) {
    const pad = Math.max(3, Math.floor(times.length * 0.02))
    const end = highlighted.exitIndex !== null ? highlighted.exitIndex : times.length - 1
    const zoomStart = Math.max(0, highlighted.entryIndex - pad)
    const zoomEnd = Math.min(times.length - 1, end + pad)
    zoomStartPct = times.length > 1 ? (zoomStart / (times.length - 1)) * 100 : 0
    zoomEndPct = times.length > 1 ? (zoomEnd / (times.length - 1)) * 100 : 100
  }

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
    const isHighlighted = props.highlightPositionId && pos.id === props.highlightPositionId

    // 开仓/平仓标注点
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
          formatter: isHighlighted
            ? `本次${pos.type === 'long' ? '开多' : '开空'} $${pos.entryPrice.toFixed(2)}`
            : `${pos.type === 'long' ? '开多' : '开空'} $${pos.entryPrice.toFixed(2)}`,
          position: 'top',
          fontSize: 11,
          fontWeight: 'bold',
          color: '#ffffff',
          backgroundColor: pos.type === 'long' ? '#10B981' : '#EF4444',
          padding: [4, 8],
          borderRadius: 4,
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
          fontSize: 11,
          fontWeight: 'bold',
          color: '#ffffff',
          backgroundColor: '#374151',
          padding: [4, 8],
          borderRadius: 4,
        },
      })
    }

    // ROI 实线部分
    const exitIdx = pos.exitIndex
    const roiSolid: (number | null)[] = new Array(times.length).fill(null)

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
      const solidEnd = exitIdx !== null ? exitIdx : times.length - 1
      for (let i = solidStart; i <= solidEnd; i++) {
        const val = pos.roiMap.get(i)
        roiSolid[i] = val !== undefined ? val : null
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

    // ROI 虚线部分（平仓后）- 保存引用用于后续控制
    if (exitIdx !== null) {
      const roiDashed: (number | null)[] = new Array(times.length).fill(null)
      roiDashed[exitIdx] = pos.roiMap.get(exitIdx) ?? null
      for (let i = exitIdx + 1; i < times.length; i++) {
        roiDashed[i] = pos.roiMap.get(i) ?? null
      }

      series.push({
        name: `${pos.label}_dashed`,
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

  // 图例数据
  const legendData = ['价格', ...positions.map(p => p.label)]

  // 保存虚线数据引用，用于图例控制
  const dashedDataMap = new Map<string, (number | null)[]>()
  positions.forEach(pos => {
    if (pos.exitIndex !== null) {
      const roiDashed: (number | null)[] = new Array(times.length).fill(null)
      roiDashed[pos.exitIndex] = pos.roiMap.get(pos.exitIndex) ?? null
      for (let i = pos.exitIndex + 1; i < times.length; i++) {
        roiDashed[i] = pos.roiMap.get(i) ?? null
      }
      dashedDataMap.set(pos.label, roiDashed)
    }
  })

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
      // 点击图例时，通过 legendselectchanged 事件处理
    },
    grid: {
      left: '3%',
      right: '4%',
      top: 40,
      bottom: multiDay ? 60 : '3%',
      containLabel: true,
    },
    // 多日时提供底部滑动条，可手动拉近任意时间窗；
    // 有聚焦仓位时默认窗口已锁定到该笔持仓，用户仍可拖动扩展查看前后文。
    dataZoom: multiDay
      ? [
          {
            type: 'inside',
            xAxisIndex: 0,
            start: zoomStartPct,
            end: zoomEndPct,
            zoomOnMouseWheel: 'shift',
          },
          {
            type: 'slider',
            xAxisIndex: 0,
            start: zoomStartPct,
            end: zoomEndPct,
            height: 18,
            bottom: 8,
          },
        ]
      : [],
    xAxis: {
      type: 'category',
      data: times,
      axisLabel: {
        // 跨日数据点多时自动稀疏显示，避免标签挤成一团
        interval: multiDay ? Math.max(0, Math.floor(times.length / 10)) : Math.floor(times.length / 8),
        rotate: multiDay ? 35 : 0,
        hideOverlap: true,
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

  // 监听图例选择变化，同步切换对应的虚线
  chartInstance.on('legendselectchanged', (params: { name: string; selected: Record<string, boolean> }) => {
    const clickedLabel = params.name

    // 如果点击的是 ROI 曲线（不是"价格"），同时切换对应的虚线
    if (clickedLabel !== '价格' && dashedDataMap.has(clickedLabel)) {
      const isSelected = params.selected[clickedLabel]
      const dashedName = `${clickedLabel}_dashed`

      // 通过更新 data 来控制显示/隐藏
      chartInstance.setOption({
        series: [{
          name: dashedName,
          data: isSelected ? dashedDataMap.get(clickedLabel) : []
        }]
      })
    }
  })
}

function resizeChart() {
  chartInstance?.resize()
}

onMounted(() => {
  // 延迟初始化，确保容器尺寸正确
  setTimeout(() => {
    initChart()
  }, 100)
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
  height: 600px;
}
</style>

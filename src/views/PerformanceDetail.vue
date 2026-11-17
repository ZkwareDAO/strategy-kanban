<template>
  <div class="performance-detail-page">
    <button class="back-btn" @click="goBack">← {{ backLabel }}</button>

    <div class="page-header">
      <h2>{{ strategyName }}</h2>
      <p>
        <span v-if="dateFrom && dateTo">{{ dateFrom }} ~ {{ dateTo }}</span>
        <span class="mode-chip" :class="modeChipClass">{{ modeLabel }}</span>
      </p>
    </div>

    <div v-if="loading" class="state">加载中...</div>
    <div v-else-if="error" class="state error">{{ error }}</div>
    <div v-else-if="hasNoData" class="state">该策略暂无交易数据</div>

    <div v-else class="table-wrapper">
      <table class="perf-table">
        <thead>
          <tr>
            <th>标的</th>
            <th>总交易数</th>
            <th>盈利交易</th>
            <th>亏损交易</th>
            <th>胜率</th>
            <th>最大盈利</th>
            <th>最大亏损</th>
            <th>盈利单合计</th>
            <th>亏损单合计</th>
            <th>总盈亏</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in symbolList" :key="s.symbol">
            <td class="col-name">{{ s.symbol }}</td>
            <td>{{ s.total_trades }}</td>
            <td class="val-positive">{{ s.winning_trades }}</td>
            <td class="val-negative">{{ s.losing_trades }}</td>
            <td :class="winRateClass(s.win_rate)">{{ fmtPct(s.win_rate) }}</td>
            <td class="val-positive">{{ fmtPnl(s.max_profit) }}</td>
            <td class="val-negative">{{ fmtPnl(s.max_loss) }}</td>
            <td class="val-positive">{{ fmtPnl(s.profit_sum) }}</td>
            <td class="val-negative">{{ fmtPnl(s.loss_sum) }}</td>
            <td :class="pnlClass(s.total_pnl)">{{ fmtPnl(s.total_pnl) }}</td>
            <td>
              <button class="more-btn" @click="goCandle(s.symbol)">更多</button>
            </td>
          </tr>

          <tr v-if="symbolList.length === 0" class="row-muted">
            <td colspan="11">该区间内无已平仓交易</td>
          </tr>

          <!-- 持仓中分区：沉到底部，浮盈随行情变动，不计入上方已实现指标 -->
          <template v-if="openList.length > 0">
            <tr class="section-row">
              <td colspan="11">
                <span class="section-title">持仓中</span>
                <span class="section-hint">尚未平仓，浮盈随行情变动，不计入上方已实现指标</span>
              </td>
            </tr>
            <tr v-for="o in openList" :key="`open-${o.symbol}`" class="open-row">
              <td class="col-name">
                {{ o.symbol }}
                <span class="open-badge">持仓中</span>
              </td>
              <td>{{ o.open_trades }}</td>
              <td colspan="7" class="col-floating-label">浮动盈亏</td>
              <td :class="pnlClass(o.floating_pnl)">{{ fmtPnl(o.floating_pnl) }}</td>
              <td>
                <button class="more-btn" @click="goCandle(o.symbol)">更多</button>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { dataRepository } from '@/data'
import { loadOrderPositions } from '@/services/livePerformance'
import { filterPositionsByTradingMode, type SelectableMode } from '@/utils/modeFilter'
import { accumulatePnlSplit, initPnlSplit } from '@/utils/perfAggregate'
import { splitRealizedAndOpen } from '@/utils/positionSplit'
import type { OrderPosition, SymbolPerformance } from '@/models/performance'

const props = defineProps<{
  strategyName: string
}>()

const route = useRoute()
const router = useRouter()
const dateFrom = route.query.from as string
const dateTo = route.query.to as string
// 来源 tab：从「每日收益」进入为 strategy，从「区间统计」进入为 performance
const fromTab = (route.query.from_tab as string) || 'performance'
const backLabel = fromTab === 'strategy' ? '返回每日收益' : '返回区间统计'
// 所选模式（区间统计透传，逗号分隔；默认全部）
const VALID_SELECTABLE: SelectableMode[] = ['live', 'smoking']
function parseModes(raw: unknown): Set<SelectableMode> {
  if (typeof raw !== 'string' || !raw) return new Set(VALID_SELECTABLE)
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean)
  const set = new Set<SelectableMode>()
  for (const p of parts) {
    if ((VALID_SELECTABLE as string[]).includes(p)) set.add(p as SelectableMode)
  }
  return set.size > 0 ? set : new Set(VALID_SELECTABLE)
}
const selectedModes = parseModes(route.query.modes)
const modeLabel = selectedModes.size === 2
  ? '全部'
  : Array.from(selectedModes).map(m => m === 'live' ? 'Product' : 'Smoking').join('|')
// chip 统一中性灰，不再用模式配色
const modeChipClass = 'all'
// 蜡烛图周期透传（默认 1h）
const tf = (route.query.tf as string) || '1h'

const loading = ref(true)
const error = ref('')
const rawPositions = ref<OrderPosition[]>([])

/** 已实现 / 持仓中拆分：共用 positionSplit 的口径，与每日收益、区间统计一致 */
const positionSplit = computed(() => splitRealizedAndOpen(rawPositions.value))

const symbolList = computed<SymbolPerformance[]>(() => {
  const closed = positionSplit.value.realized
  const map = new Map<string, SymbolPerformance>()

  for (const p of closed) {
    const sym = p.asset
    const existing = map.get(sym)
    if (existing) {
      existing.total_trades += 1
      if (p.pnl_value > 0) existing.winning_trades += 1
      if (p.pnl_value < 0) existing.losing_trades += 1
      existing.total_pnl += p.pnl_value
      accumulatePnlSplit(existing, p.pnl_value)
      if (p.pnl_value > existing.max_profit) existing.max_profit = p.pnl_value
      if (p.pnl_value < existing.max_loss) existing.max_loss = p.pnl_value
    } else {
      map.set(sym, {
        symbol: sym,
        total_trades: 1,
        winning_trades: p.pnl_value > 0 ? 1 : 0,
        losing_trades: p.pnl_value < 0 ? 1 : 0,
        win_rate: 0,
        max_profit: p.pnl_value > 0 ? p.pnl_value : 0,
        max_loss: p.pnl_value < 0 ? p.pnl_value : 0,
        ...initPnlSplit(p.pnl_value),
        total_pnl: p.pnl_value,
      })
    }
  }

  for (const s of map.values()) {
    s.win_rate = s.total_trades > 0 ? s.winning_trades / s.total_trades : 0
  }

  return Array.from(map.values()).sort((a, b) => b.total_pnl - a.total_pnl)
})

/** 持仓中的标的（按币种聚合浮盈），沉到表格底部独立分区展示 */
interface OpenSymbolRow {
  symbol: string
  open_trades: number
  floating_pnl: number
}

const openList = computed<OpenSymbolRow[]>(() => {
  const map = new Map<string, OpenSymbolRow>()
  for (const p of positionSplit.value.open) {
    const existing = map.get(p.asset)
    if (existing) {
      existing.open_trades += 1
      existing.floating_pnl += p.pnl_value
    } else {
      map.set(p.asset, { symbol: p.asset, open_trades: 1, floating_pnl: p.pnl_value })
    }
  }
  return Array.from(map.values()).sort((a, b) => b.floating_pnl - a.floating_pnl)
})

/**
 * 空状态判定：已实现与持仓中都为空才算"暂无交易数据"。
 * 只看已实现会让"仅持仓中"的策略显示无数据——与每日收益的"持仓 N"矛盾。
 */
const hasNoData = computed(() => symbolList.value.length === 0 && openList.value.length === 0)

async function fetchData() {
  if (!dateFrom || !dateTo) {
    loading.value = false
    return
  }
  loading.value = true
  error.value = ''
  try {
    const fromDay = dateFrom.replace(/-/g, '')
    const toDay = dateTo.replace(/-/g, '')
    const catalog = await dataRepository.getCatalog()
    // 只为区间内确实存在该策略的日期发请求；live_positions.csv 是策略级文件
    const days = catalog
      .filter(
        (day) =>
          day.day >= fromDay &&
          day.day <= toDay &&
          day.strategies.includes(props.strategyName),
      )
      .map((day) => ({ ...day, strategies: [props.strategyName] }))
    const positions = await loadOrderPositions(days)
    rawPositions.value = filterPositionsByTradingMode(positions, selectedModes).positions
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

// 新版路由以策略目录名 + 标的定位数据文件，无需再反查 runtime。
function goCandle(symbol: string) {
  router.push({
    name: 'TokenDetailV2',
    params: {
      strategy: props.strategyName,
      symbol,
    },
    query: {
      from: dateFrom,
      to: dateTo,
      tf,
      source: 'live',
    },
  })
}

function fmtPct(v: number): string {
  if (Number.isNaN(v)) return '-'
  return (v * 100).toFixed(1) + '%'
}

function fmtPnl(v: number): string {
  if (Number.isNaN(v)) return '-'
  return v.toFixed(4)
}

function winRateClass(v: number): string {
  return v >= 0.5 ? 'val-positive' : 'val-negative'
}

function pnlClass(v: number): string {
  return v > 0 ? 'val-positive' : v < 0 ? 'val-negative' : ''
}

function goBack() {
  // 优先用浏览器历史栈返回（回到上一页，即来源 tab 所在的首页状态）
  if (window.history.length > 1) {
    router.back()
    return
  }
  // 无历史时兜底：按来源 tab 回到首页对应 tab
  router.push({ path: '/', query: { tab: fromTab } })
}

onMounted(fetchData)
</script>

<style scoped lang="scss">
.performance-detail-page {
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
    display: flex;
    align-items: center;
    gap: 12px;
  }
}

.mode-chip {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;

  &.all {
    background: #f3f4f6;
    color: #6b7280;
  }
}

.state {
  padding: 40px;
  text-align: center;
  color: #6b7280;

  &.error {
    color: #dc2626;
  }
}

.table-wrapper {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  overflow-x: auto;
}

.perf-table {
  width: 100%;
  border-collapse: collapse;

  th, td {
    padding: 14px 16px;
    text-align: center;
    font-size: 14px;
    border-bottom: 1px solid #f3f4f6;
  }

  th {
    background: #f9fafb;
    font-weight: 600;
    color: #6b7280;
    font-size: 13px;
    letter-spacing: 0.5px;
  }

  .col-name {
    text-align: left;
    font-weight: 600;
    color: #1f2937;
  }
}

// 无已平仓交易时的占位行：与"暂无数据"区分——这里只是上半区为空
.row-muted td {
  color: #9ca3af;
  font-size: 13px;
  padding: 20px 16px;
}

// 持仓中分区标题行：视觉上与已实现区隔开
.section-row td {
  background: #f9fafb;
  border-top: 2px solid #e5e7eb;
  text-align: left;
  padding: 12px 16px;
}

.section-title {
  font-size: 13px;
  font-weight: 700;
  color: #2563eb;
  letter-spacing: 0.5px;
}

.section-hint {
  margin-left: 10px;
  font-size: 12px;
  color: #9ca3af;
}

.open-row {
  background: #fcfdff;

  .col-floating-label {
    color: #9ca3af;
    font-size: 12px;
  }
}

// 蓝色表示"进行中"而非盈/亏，与每日收益页的持仓标记保持一致
.open-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 1px 7px;
  border-radius: 8px;
  background: #eff6ff;
  color: #2563eb;
  font-size: 11px;
  font-weight: 600;
  vertical-align: middle;
}

.more-btn {
  padding: 6px 16px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: #2563eb;
  }
}

.val-positive {
  color: #16a34a;
  font-weight: 600;
}

.val-negative {
  color: #dc2626;
  font-weight: 600;
}
</style>

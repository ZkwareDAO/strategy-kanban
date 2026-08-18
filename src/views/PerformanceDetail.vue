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
    <div v-else-if="symbolList.length === 0" class="state">该策略暂无交易数据</div>

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
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getOrderPositions } from '@/api/performance'
import { getRuntimesForDateRange } from '@/api/strategy'
import { buildModeIndex, filterPositionsByModes, dedupePositions, findRuntimeForAsset, type SelectableMode, type ModeIndex } from '@/utils/modeFilter'
import { accumulatePnlSplit, initPnlSplit } from '@/utils/perfAggregate'
import type { OrderPosition, SymbolPerformance } from '@/models/performance'
import type { Runtime } from '@/models/runtime'

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
const modeIndex = ref<ModeIndex>({ exact: new Map(), byBase: new Map() })
// 区间内所有运行实例，用于跳转蜡烛图时按 (dir_name, symbol, 模式) 反查 source_strategy / runtime_name
const runtimes = ref<Runtime[]>([])

function toRfc3339(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function dateToStartOfDay(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0))
}

function dateToEndOfDay(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59))
}

const symbolList = computed<SymbolPerformance[]>(() => {
  const closed = rawPositions.value.filter(p => p.deleted === 1 && p.pos_type === 2)
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

async function fetchData() {
  if (!dateFrom || !dateTo) {
    loading.value = false
    return
  }
  loading.value = true
  error.value = ''
  try {
    const from = toRfc3339(dateToStartOfDay(dateFrom))
    const to = toRfc3339(dateToEndOfDay(dateTo))
    const [allPositions, rangeRuntimes] = await Promise.all([
      getOrderPositions(from, to),
      getRuntimesForDateRange(from, to),
    ])
    modeIndex.value = buildModeIndex(rangeRuntimes)
    runtimes.value = rangeRuntimes
    // 1. 匹配策略组：strategy_name 以策略组名开头
    //    （如 DOLPHINV2_4H_2_DOGEUSDT 匹配 DOLPHINV2_4H_2）
    // 2. 跨日快照去重（同一笔未平仓位在每日 CSV 中重复出现）
    // 3. 再按所选模式（Product/Smoking）过滤
    const inStrategy = allPositions.filter(p => {
      if (p.strategy_name === props.strategyName) return true
      return p.strategy_name.startsWith(props.strategyName + '_')
    })
    const result = filterPositionsByModes(
      dedupePositions(inStrategy),
      modeIndex.value,
      selectedModes,
    )
    rawPositions.value = result.positions
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

// 按 (dir_name, asset, 选中模式) 反查 runtime，用于跳转蜡烛图时补齐 dir/runtime
// 参数，使 TokenDetailV2 能加载开平仓点、回放、对比数据与策略逻辑（与每日收益入口一致）。
// 支持结算币回退：仓位 asset 为 WLDUSDC 时也能找到 manifest 里的 WLDUSDT runtime。
function findRuntime(symbol: string): Runtime | undefined {
  return findRuntimeForAsset(runtimes.value, props.strategyName, symbol, selectedModes)
}

function goCandle(symbol: string) {
  const runtime = findRuntime(symbol)
  // route param strategy 用 source_strategy（策略内部名），用于匹配策略逻辑配置；
  // 没有 runtime 时回退为 dir_name，TokenDetailV2 会以纯K线模式展示。
  const sourceStrategy = runtime?.strategy ?? props.strategyName
  // symbol 用 runtime.symbol 而非仓位 asset：数据文件目录按 manifest 的交易对命名，
  // 结算币漂移时（仓位 WLDUSDC / 目录 WLDUSDT）用 asset 会让四条数据路径全部 404，
  // 蜡烛图退化成纯K线。runtime 已由 findRuntimeForAsset 跨结算币找到，取其 symbol 才对得上磁盘。
  const dataSymbol = runtime?.symbol ?? symbol
  router.push({
    name: 'TokenDetailV2',
    params: {
      strategy: sourceStrategy,
      symbol: dataSymbol,
    },
    query: {
      from: dateFrom,
      to: dateTo,
      tf,
      ...(runtime ? { runtime: runtime.runtime_name, dir: runtime.dir_name } : {}),
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

<template>
  <div class="performance-overview">
    <!-- 工具栏：模式切换 + 日期范围 + 快捷预设 + 前后日步进 -->
    <div class="toolbar">
      <div class="mode-filter">
        <span class="mode-filter-label">模式</span>
        <div class="mode-chips">
          <button
            v-for="m in MODE_OPTIONS"
            :key="m.value"
            class="mode-chip"
            :class="{ active: isModeActive(m.value), [m.value]: isModeActive(m.value) }"
            @click="toggleMode(m.value)"
          >
            <span class="check" aria-hidden="true">✓</span>
            {{ m.label }}
          </button>
        </div>
      </div>

      <div class="date-stepper">
        <button class="step-btn" title="整体前移一日" @click="stepRange(-1)">‹</button>
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          format="YYYY-MM-DD"
          value-format="YYYY-MM-DD"
          :shortcuts="dateShortcuts"
          :clearable="false"
          @change="handleDateChange"
        />
        <button class="step-btn" title="整体后移一日" @click="stepRange(1)">›</button>
      </div>

      <span class="row-count">{{ strategyList.length }} 条策略</span>

      <!-- 数据源诊断：兼容命中为中性提示（已计入统计），未关联为需处理提示（未计入） -->
      <span
        v-if="fallbackCount > 0"
        class="diag diag-info"
        :title="`以下仓位的实盘结算币与 manifest 配置不一致，已按 base 币兼容匹配并正常计入统计：\n\n${fallbackTip}`"
      >
        <span class="diag-icon">ⓘ</span>{{ fallbackCount }} 项按结算币兼容
      </span>
      <span
        v-if="unmatchedCount > 0"
        class="diag diag-warn"
        :title="`以下仓位在 manifest 中找不到对应策略，无法判定运行模式，未计入统计：\n\n${unmatchedTip}`"
      >
        <span class="diag-icon">⚠</span>{{ unmatchedCount }} 项未关联模式
      </span>
    </div>

    <div v-if="loading" class="state">加载中...</div>
    <div v-else-if="error" class="state error">{{ error }}</div>
    <div v-else-if="strategyList.length === 0" class="state">暂无策略表现数据</div>

    <!-- 策略表现表格 -->
    <div v-else class="table-wrapper">
      <table class="perf-table">
        <thead>
          <tr>
            <th>策略名称</th>
            <th>PNL</th>
            <th>盈利单合计</th>
            <th>亏损单合计</th>
            <th>胜率</th>
            <th>杠杆</th>
            <th>模式</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in strategyList" :key="s.strategy_name">
            <td class="col-name" :title="s.strategy_name">{{ formatStrategyName(s.strategy_name) }}</td>
            <td :class="pnlClass(s.total_pnl)">{{ fmtPnl(s.total_pnl) }}</td>
            <td class="val-positive">{{ fmtPnl(s.profit_sum ?? 0) }}</td>
            <td class="val-negative">{{ fmtPnl(s.loss_sum ?? 0) }}</td>
            <td :class="winRateClass(s.win_rate)">{{ fmtPct(s.win_rate) }}</td>
            <td>{{ s.max_leverage }}x</td>
            <td class="col-modes">
              <span v-if="s.modes.length === 0" class="muted">-</span>
              <span
                v-for="(m, index) in s.modes"
                :key="m"
                class="mode-text"
              >{{ formatMode(m)
              }}<span v-if="index < s.modes.length - 1" class="sep">|</span></span>
            </td>
            <td>
              <button class="more-btn" @click="goDetail(s.strategy_name)">更多</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { getOrderPositions } from '@/api/performance'
import { getRuntimesForDateRange } from '@/api/strategy'
import { buildModeIndex, filterPositionsByModes, resolveModes, dedupePositions, extractStrategyGroup, type SelectableMode, type ModeIndex } from '@/utils/modeFilter'
import { formatStrategyName } from '@/utils/display'
import { accumulatePnlSplit, initPnlSplit, type PnlSplitBucket } from '@/utils/perfAggregate'
import type { OrderPosition, StrategyPerformance } from '@/models/performance'
import type { TradingMode } from '@/models/runtime'

const router = useRouter()
const appStore = useAppStore()

const MODE_OPTIONS: { value: SelectableMode; label: string }[] = [
  { value: 'live', label: 'Product' },
  { value: 'smoking', label: 'Smoking' },
]

const loading = ref(false)
const error = ref('')
const rawPositions = ref<OrderPosition[]>([])
const modeIndex = ref<ModeIndex>({ exact: new Map(), byBase: new Map() })
// 多选模式：默认全选，至少保留一个；点击已选中的模式会取消（若是最后一个则忽略）
const selectedModes = ref<Set<SelectableMode>>(new Set(['live', 'smoking']))

// ---- 日期范围 ----
function getLastMonday(): Date {
  const now = new Date()
  const day = now.getDay() // 0=Sun
  const diff = day === 0 ? 6 : day - 1
  const monday = new Date(now)
  monday.setDate(now.getDate() - diff - 7) // 上周一
  monday.setHours(0, 0, 0, 0)
  return monday
}

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

const lastMonday = getLastMonday()
const today = new Date()
today.setHours(23, 59, 59, 0)

const dateRange = ref<[string, string]>(
  appStore.performanceRange ?? [
    lastMonday.toISOString().slice(0, 10),
    today.toISOString().slice(0, 10),
  ],
)

// 日期快捷预设（el-date-picker daterange shortcuts API）
const dateShortcuts = computed(() => {
  const now = new Date()
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const yesterday = new Date(todayStart)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const day7 = new Date(todayStart)
  day7.setUTCDate(day7.getUTCDate() - 6)
  const day30 = new Date(todayStart)
  day30.setUTCDate(day30.getUTCDate() - 29)
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  return [
    { text: '今日', value: [todayStart, todayStart] as [Date, Date] },
    { text: '昨日', value: [yesterday, yesterday] as [Date, Date] },
    { text: '近7日', value: [day7, todayStart] as [Date, Date] },
    { text: '近30日', value: [day30, todayStart] as [Date, Date] },
    { text: '本月', value: [monthStart, todayStart] as [Date, Date] },
  ]
})

// 前后日整体平移（保持区间跨度不变）
function stepRange(delta: number): void {
  if (!dateRange.value || dateRange.value.length !== 2) return
  const [from, to] = dateRange.value
  const fromDt = dateToStartOfDay(from)
  const toDt = dateToStartOfDay(to)
  fromDt.setUTCDate(fromDt.getUTCDate() + delta)
  toDt.setUTCDate(toDt.getUTCDate() + delta)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  dateRange.value = [fmt(fromDt), fmt(toDt)]
  handleDateChange()
}

// 多选切换：点亮/取消某模式；至少保留一个，不允许全空
function toggleMode(m: SelectableMode): void {
  const next = new Set(selectedModes.value)
  if (next.has(m)) {
    if (next.size > 1) next.delete(m)
  } else {
    next.add(m)
  }
  selectedModes.value = next
}

function isModeActive(m: SelectableMode): boolean {
  return selectedModes.value.has(m)
}

interface StrategyRow extends StrategyPerformance {
  /** 该策略在选中模式下实际命中的模式 */
  modes: SelectableMode[]
}

// ---- 过滤 + 诊断 ----
// 仅统计已平仓的期货交易 (deleted=1, pos_type=2)；跨日快照去重后按选中模式过滤。
// 结算币回退命中的仓位与精确命中同等计入，仅在 quoteFallbacks 中单独记录。
const filterResult = computed(() => {
  const closed = rawPositions.value.filter((p) => p.deleted === 1 && p.pos_type === 2)
  return filterPositionsByModes(dedupePositions(closed), modeIndex.value, selectedModes.value)
})

/** 结算币兼容命中数（已计入统计，仅作数据源不一致提示） */
const fallbackCount = computed(() => filterResult.value.quoteFallbacks.length)
const fallbackTip = computed(() =>
  filterResult.value.quoteFallbacks
    .map((f) => `${f.strategy} | ${f.asset} → manifest 中为 ${f.matchedSymbol}`)
    .join('\n'),
)

/** 完全无法关联模式的仓位数（未计入统计） */
const unmatchedCount = computed(() => filterResult.value.unmatched.length)
const unmatchedTip = computed(() =>
  filterResult.value.unmatched.map((u) => `${u.strategy} | ${u.asset}`).join('\n'),
)

// ---- 聚合策略维度数据（按 dir_name 聚合）----
const strategyList = computed<StrategyRow[]>(() => {
  const map = new Map<string, StrategyRow>()
  const groupModes = new Map<string, Set<'live' | 'smoking'>>()

  for (const p of filterResult.value.positions) {
    const group = extractStrategyGroup(p.strategy_name)
    // 累计该策略命中的模式
    const match = resolveModes(p, modeIndex.value)
    if (match) {
      let gm = groupModes.get(group)
      if (!gm) {
        gm = new Set<'live' | 'smoking'>()
        groupModes.set(group, gm)
      }
      if (match.modes.has('live')) gm.add('live')
      if (match.modes.has('smoking')) gm.add('smoking')
    }
    const existing = map.get(group)
    if (existing) {
      existing.total_trades += 1
      if (p.pnl_value > 0) existing.winning_trades += 1
      if (p.pnl_value < 0) existing.losing_trades += 1
      existing.total_pnl += p.pnl_value
      accumulatePnlSplit(existing as PnlSplitBucket, p.pnl_value)
      if (p.leverage > existing.max_leverage) existing.max_leverage = p.leverage
    } else {
      map.set(group, {
        strategy_name: group,
        total_trades: 1,
        winning_trades: p.pnl_value > 0 ? 1 : 0,
        losing_trades: p.pnl_value < 0 ? 1 : 0,
        win_rate: 0,
        total_pnl: p.pnl_value,
        ...initPnlSplit(p.pnl_value),
        max_leverage: p.leverage,
        mode: 'live',
        modes: [],
      })
    }
  }

  for (const s of map.values()) {
    s.win_rate = s.total_trades > 0 ? s.winning_trades / s.total_trades : 0
    const gm = groupModes.get(s.strategy_name)
    s.modes = gm ? Array.from(gm) : []
  }

  return Array.from(map.values()).sort((a, b) => b.total_pnl - a.total_pnl)
})

async function fetchData() {
  if (!dateRange.value || dateRange.value.length !== 2) return
  loading.value = true
  error.value = ''
  try {
    const from = toRfc3339(dateToStartOfDay(dateRange.value[0]))
    const to = toRfc3339(dateToEndOfDay(dateRange.value[1]))
    const [positions, runtimes] = await Promise.all([
      getOrderPositions(from, to),
      getRuntimesForDateRange(from, to),
    ])
    rawPositions.value = positions
    modeIndex.value = buildModeIndex(runtimes)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

function handleDateChange() {
  // 记住用户的选择，使切 tab 或进出详情页后返回时不被重置为默认区间
  if (dateRange.value?.length === 2) {
    appStore.setPerformanceRange(dateRange.value[0], dateRange.value[1])
  }
  fetchData()
}

function goDetail(strategyName: string) {
  router.push({
    name: 'PerformanceDetail',
    params: { strategyName },
    query: {
      from: dateRange.value?.[0] ?? '',
      to: dateRange.value?.[1] ?? '',
      from_tab: 'performance',
      modes: Array.from(selectedModes.value).join(','),
      tf: '1h',
    },
  })
}

function formatMode(mode: string): string {
  if (mode === 'live') return 'Product'
  if (mode === 'smoking') return 'Smoking'
  return mode
}

// ---- Formatting ----
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

onMounted(fetchData)
</script>

<style scoped lang="scss">
.performance-overview {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid #f0f0f0;
  flex-wrap: wrap;
}

.mode-filter {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.mode-filter-label {
  font-size: 13px;
  font-weight: 600;
  color: #9ca3af;
  letter-spacing: 0.5px;
}

.mode-chips {
  display: inline-flex;
  gap: 8px;
}

.mode-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 999px;
  border: 1.5px solid #e5e7eb;
  background: #fff;
  font-size: 13px;
  font-weight: 600;
  color: #9ca3af;
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;

  .check {
    font-size: 12px;
    opacity: 0;
    transform: scale(0.6);
    transition: all 0.15s;
  }

  &:hover {
    border-color: #d1d5db;
    color: #6b7280;
  }

  &.active {
    background: #4b5563;
    border-color: #4b5563;
    color: #fff;
  }

  &.active .check {
    opacity: 1;
    transform: scale(1);
  }
}

.date-stepper {
  display: flex;
  align-items: center;
  gap: 6px;
}

.step-btn {
  width: 30px;
  height: 30px;
  border-radius: 6px;
  border: 1px solid #dcdfe6;
  background: #fff;
  color: #606266;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.15s;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &:hover {
    border-color: #3b82f6;
    color: #3b82f6;
  }
}

.row-count {
  font-size: 13px;
  color: #9ca3af;
}

// 数据源诊断提示：info 为中性（已计入统计），warn 为待处理（未计入统计）
.diag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  cursor: help;
  white-space: nowrap;

  .diag-icon {
    font-size: 13px;
    line-height: 1;
  }
}

.diag-info {
  color: #6b7280;
  background: #f3f4f6;
}

.diag-warn {
  color: #b45309;
  background: #fef3c7;
}

.state {
  padding: 48px;
  text-align: center;
  color: #6b7280;

  &.error {
    color: #dc2626;
  }
}

.table-wrapper {
  overflow-x: auto;
}

.perf-table {
  width: 100%;
  border-collapse: collapse;

  th,
  td {
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

  .col-modes {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
  }

  .muted {
    color: #d1d5db;
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

.mode-text {
  display: inline-block;
  font-weight: 500;
  color: #374151;

  .sep {
    color: #d1d5db;
    margin: 0 4px;
    font-weight: 400;
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

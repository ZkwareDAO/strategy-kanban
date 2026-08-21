<template>
  <div class="daily-replay-overview">
    <!-- 工具栏：日期步进 + 筛选 -->
    <div class="toolbar">
      <date-stepper :model-value="selectedDate" @update:model-value="handleDateChange" />
      <el-select
        v-model="selectedStrategy"
        placeholder="全部策略"
        clearable
        class="strategy-filter"
      >
        <el-option v-for="s in availableStrategies" :key="s" :label="s" :value="s" />
      </el-select>
      <span class="row-count">{{ filteredGroups.length }} 条记录</span>
      <div class="toolbar-right">
        <el-switch
          v-model="includeEmpty"
          size="small"
          active-text="显示无信号策略"
          :title="EMPTY_SWITCH_HINT"
        />
      </div>
    </div>

    <!-- 状态 -->
    <div v-if="loading" class="state">加载中...</div>
    <div v-else-if="filteredGroups.length === 0" class="state">
      <template v-if="hiddenEmptyCount > 0">
        <p>该日 {{ hiddenEmptyCount }} 个策略均未触发信号</p>
        <p class="state-hint">打开右上角「显示无信号策略」可查看这些回测</p>
      </template>
      <template v-else>该日暂无回测数据</template>
    </div>

    <!-- 策略层级分组表格 -->
    <div v-else class="table-wrapper">
      <table class="group-table">
        <thead>
          <tr>
            <th class="sortable" @click="toggleSort('strategy')">
              策略名称 <span class="sort-arrow">{{ sortArrow('strategy') }}</span>
            </th>
            <th>标的</th>
            <th class="sortable" @click="toggleSort('best_roe')">
              最佳 ROE <span class="sort-arrow">{{ sortArrow('best_roe') }}</span>
            </th>
            <th class="sortable" @click="toggleSort('signals')">
              信号数 <span class="sort-arrow">{{ sortArrow('signals') }}</span>
            </th>
            <th class="sortable" @click="toggleSort('completed_at')">
              完成时间 <span class="sort-arrow">{{ sortArrow('completed_at') }}</span>
            </th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="g in pagedGroups" :key="groupKey(g)">
            <td class="col-name">{{ g.strategy }}</td>
            <td class="col-tokens">
              <span v-for="(sym, i) in g.symbols" :key="sym" class="token-chip">
                {{ formatSymbol(sym) }}<span v-if="i < g.symbols.length - 1" class="sep">|</span>
              </span>
            </td>
            <td :class="pctClass(g.best_roe)">{{ fmtPct(g.best_roe) }}</td>
            <td :class="{ 'val-muted': signalCount(g) === 0 }">{{ signalCount(g) }}</td>
            <td class="col-time">{{ formatCompletedAt(g.completed_at) }}</td>
            <td>
              <button class="more-btn" @click="goTokenList(g)">更多</button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 分页：仅在行数超过一页时出现，行数少时界面与原先完全一致 -->
      <div v-if="showPagination" class="pagination-bar">
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="PAGE_SIZE"
          :total="sortedGroups.length"
          layout="prev, pager, next, total"
          background
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { getReplayIndex, clearReplayIndexCache } from '@/api/backtest'
import { groupRuns } from '@/utils/backtestIndex'
import { formatSymbol } from '@/utils/display'
import { compactDaysAgo } from '@/utils/compactDate'
import DateStepper from '@/components/common/DateStepper.vue'
import type { BacktestOutputEntry, BacktestGroupRow } from '@/models/backtest'

const router = useRouter()
const appStore = useAppStore()

/** 超过此行数才显示分页条--数据少时界面保持零变化 */
const PAGE_SIZE = 20

const EMPTY_SWITCH_HINT =
  '无信号策略指当天跑完回测但未触发任何交易信号，默认隐藏以突出真正有动作的策略'

const loading = ref(false)
const entries = ref<BacktestOutputEntry[]>([])
const selectedStrategy = ref('')
const currentPage = ref(1)
/** 是否展示当天"跑了但没出信号"的策略 */
const includeEmpty = ref(false)
// 与「每日收益」共享 store 里的日期：两个 tab 间来回切换不必重新选一次
const selectedDate = ref(appStore.date || compactDaysAgo(1))

type SortKey = 'strategy' | 'best_roe' | 'signals' | 'completed_at'
// 默认按最佳 ROE 倒序：一天之内完成时间都挨在一起，按表现排更有信息量
const sortKey = ref<SortKey>('best_roe')
const sortAsc = ref(false)

// 分组逻辑与策略发现完全一致（同构数据源），仅空回测的取舍交给开关
const groups = computed<BacktestGroupRow[]>(() =>
  groupRuns(entries.value, { includeEmpty: includeEmpty.value }),
)

const availableStrategies = computed(() => {
  const set = new Set(groups.value.map(g => g.strategy))
  return Array.from(set).sort()
})

/**
 * 被开关隐藏掉的策略数：用于空态提示。
 *
 * 没有它，"当天全部策略都没信号"与"当天没跑回测"在界面上长得一样，
 * 用户会以为页面坏了。
 */
const hiddenEmptyCount = computed(() => {
  if (includeEmpty.value) return 0
  return groupRuns(entries.value, { includeEmpty: true }).length - groups.value.length
})

const filteredGroups = computed(() => {
  if (!selectedStrategy.value) return groups.value
  return groups.value.filter(g => g.strategy === selectedStrategy.value)
})

// 排序在全量上做完，再切页--否则分页会把排序切成"仅当前页有序"
const sortedGroups = computed(() => {
  const arr = [...filteredGroups.value]
  const dir = sortAsc.value ? 1 : -1
  arr.sort((a, b) => {
    let cmp = 0
    switch (sortKey.value) {
      case 'strategy':
        cmp = a.strategy.localeCompare(b.strategy)
        break
      case 'best_roe': {
        const av = Number.isFinite(a.best_roe) ? a.best_roe : -Infinity
        const bv = Number.isFinite(b.best_roe) ? b.best_roe : -Infinity
        cmp = av - bv
        break
      }
      case 'signals':
        cmp = signalCount(a) - signalCount(b)
        break
      case 'completed_at':
        cmp = a.completed_at.localeCompare(b.completed_at)
        break
    }
    return cmp * dir
  })
  return arr
})

/** 分页条仅在行数超过一页时出现 */
const showPagination = computed(() => sortedGroups.value.length > PAGE_SIZE)

const pagedGroups = computed(() => {
  if (!showPagination.value) return sortedGroups.value
  const start = (currentPage.value - 1) * PAGE_SIZE
  return sortedGroups.value.slice(start, start + PAGE_SIZE)
})

/** 总页数（无数据时按 1 页算，避免 currentPage 归零） */
const pageCount = computed(() => Math.max(1, Math.ceil(sortedGroups.value.length / PAGE_SIZE)))

// 筛选/排序/开关变化后回到第一页，避免停在越界的空页
watch([selectedStrategy, sortKey, sortAsc, includeEmpty], () => {
  currentPage.value = 1
})

// 数据刷新后行数可能变少，把越界的页码收回到最后一页
watch(pageCount, count => {
  if (currentPage.value > count) currentPage.value = count
})

// 切换日期后，原策略筛选可能在新的一天不存在，会导致表格空白且看不出原因
watch(entries, () => {
  if (selectedStrategy.value && !availableStrategies.value.includes(selectedStrategy.value)) {
    selectedStrategy.value = ''
  }
})

/** 组内信号总数：直观体现"当天这个策略有没有动作" */
function signalCount(g: BacktestGroupRow): number {
  return g.token_entries.reduce((sum, e) => sum + (e.signals_processed ?? 0), 0)
}

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value
  } else {
    sortKey.value = key
    // 数值/时间类默认降序，策略名默认升序
    sortAsc.value = key === 'strategy'
  }
}

function sortArrow(key: SortKey): string {
  if (sortKey.value !== key) return ''
  return sortAsc.value ? '▲' : '▼'
}

function groupKey(g: BacktestGroupRow): string {
  return `${g.strategy}|${g.date}|${g.sweep}`
}

function formatCompletedAt(ts: string): string {
  if (!ts) return '-'
  // ISO 如 2026-06-30T07:48:57 或紧凑 20260630T074857
  const m = ts.match(/^(\d{4})-?(\d{2})-?(\d{2})[T\s]?(\d{2}):?(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`
  return ts
}

function fmtPct(v: number): string {
  if (!Number.isFinite(v)) return '-'
  return (v * 100).toFixed(2) + '%'
}

function pctClass(v: number): string {
  if (!Number.isFinite(v)) return ''
  return v > 0 ? 'val-positive' : v < 0 ? 'val-negative' : ''
}

function goTokenList(g: BacktestGroupRow) {
  router.push({
    name: 'ReplayTokenList',
    query: {
      // day 是数据所属日期（目录名），date 是回测运行日期--跨零点时二者不同
      day: selectedDate.value,
      strategy: g.strategy,
      date: g.date,
      sweep: String(g.sweep),
    },
  })
}

async function handleDateChange(date: string) {
  selectedDate.value = date
  appStore.setDate(date)
  await loadRows()
}

async function loadRows() {
  loading.value = true
  try {
    entries.value = await getReplayIndex(selectedDate.value)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  // 首次进入时把默认日期同步进 store，使切到「每日收益」时日期一致
  if (!appStore.date) appStore.setDate(selectedDate.value)
  await loadRows()
})

// dev 期间监听 vite 插件推送的索引更新事件，自动重新加载
if (import.meta.hot) {
  import.meta.hot.on('replay-index-updated', () => {
    clearReplayIndexCache()
    loadRows()
  })
}
</script>

<style scoped lang="scss">
.daily-replay-overview {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.state {
  padding: 48px;
  text-align: center;
  color: #6b7280;

  p {
    margin: 4px 0;
  }

  .state-hint {
    font-size: 13px;
    color: #9ca3af;
  }
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid #f0f0f0;
}

.toolbar-right {
  margin-left: auto;
}

.strategy-filter {
  width: 220px;
}

.row-count {
  font-size: 13px;
  color: #9ca3af;
}

.table-wrapper {
  overflow-x: auto;
}

.pagination-bar {
  display: flex;
  justify-content: flex-end;
  padding: 16px 20px;
  border-top: 1px solid #f0f0f0;
}

.group-table {
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
    white-space: nowrap;
  }

  th.sortable {
    cursor: pointer;
    user-select: none;

    &:hover {
      color: #374151;
    }
  }

  .sort-arrow {
    font-size: 10px;
    margin-left: 4px;
    color: #9ca3af;
  }

  .col-name {
    text-align: left;
    font-weight: 600;
    color: #1f2937;
  }

  .col-tokens {
    text-align: left;
  }

  .col-time {
    font-variant-numeric: tabular-nums;
    color: #6b7280;
    font-size: 13px;
  }
}

.token-chip {
  display: inline-block;
  font-weight: 500;
  color: #374151;

  .sep {
    color: #d1d5db;
    margin: 0 4px;
    font-weight: 400;
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

.val-muted {
  color: #9ca3af;
}
</style>

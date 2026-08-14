<template>
  <div class="backtest-overview">
    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="filters">
        <el-select
          v-model="selectedStrategy"
          placeholder="全部策略"
          clearable
          class="strategy-filter"
        >
          <el-option
            v-for="s in availableStrategies"
            :key="s"
            :label="s"
            :value="s"
          />
        </el-select>
        <span class="row-count">{{ filteredGroups.length }} 条记录</span>
      </div>
    </div>

    <!-- 状态 -->
    <div v-if="loading" class="state">加载中...</div>
    <div v-else-if="filteredGroups.length === 0" class="state">暂无回测数据</div>

    <!-- 策略层级分组表格 -->
    <div v-else class="table-wrapper">
      <table class="group-table">
        <thead>
          <tr>
            <th class="sortable" @click="toggleSort('strategy')">
              策略名称 <span class="sort-arrow">{{ sortArrow('strategy') }}</span>
            </th>
            <th>标的</th>
            <th class="sortable" @click="toggleSort('best_annualized')">
              最佳年化 <span class="sort-arrow">{{ sortArrow('best_annualized') }}</span>
            </th>
            <th class="sortable" @click="toggleSort('interval')">
              回测区间 <span class="sort-arrow">{{ sortArrow('interval') }}</span>
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
            <td :class="pctClass(g.best_annualized)">{{ fmtPct(g.best_annualized) }}</td>
            <td>{{ g.start_date }} ~ {{ g.end_date }}</td>
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
import { getBacktestIndex } from '@/api/backtest'
import { groupRuns } from '@/utils/backtestIndex'
import { formatSymbol } from '@/utils/display'
import type { BacktestOutputEntry, BacktestGroupRow } from '@/models/backtest'

const router = useRouter()

/** 超过此行数才显示分页条--数据少时界面保持零变化 */
const PAGE_SIZE = 20

const loading = ref(false)
const entries = ref<BacktestOutputEntry[]>([])
const selectedStrategy = ref('')
const currentPage = ref(1)

type SortKey = 'strategy' | 'best_annualized' | 'interval' | 'completed_at'
// 默认按完成时间倒序：最新的回测排在最前
const sortKey = ref<SortKey>('completed_at')
const sortAsc = ref(false)

const availableStrategies = computed(() => {
  const set = new Set(entries.value.map(e => e.strategy))
  return Array.from(set).sort()
})

// 分组：策略 + 回测区间 + 运行日期 + 同日轮次，保留全部历史记录
const groups = computed<BacktestGroupRow[]>(() => groupRuns(entries.value))

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
      case 'best_annualized': {
        const av = Number.isFinite(a.best_annualized) ? a.best_annualized : -Infinity
        const bv = Number.isFinite(b.best_annualized) ? b.best_annualized : -Infinity
        cmp = av - bv
        break
      }
      case 'interval':
        cmp = `${a.start_date}~${a.end_date}`.localeCompare(`${b.start_date}~${b.end_date}`)
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

// 筛选或排序变化后回到第一页，避免停在越界的空页
watch([selectedStrategy, sortKey, sortAsc], () => {
  currentPage.value = 1
})

// 数据刷新（dev 期间索引更新）后行数可能变少，把越界的页码收回到最后一页
watch(pageCount, count => {
  if (currentPage.value > count) currentPage.value = count
})

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value
  } else {
    sortKey.value = key
    // 数值/时间类默认降序，策略名/区间默认升序
    sortAsc.value = key === 'best_annualized' || key === 'completed_at' ? false : true
  }
}

function sortArrow(key: SortKey): string {
  if (sortKey.value !== key) return ''
  return sortAsc.value ? '▲' : '▼'
}

function groupKey(g: BacktestGroupRow): string {
  return `${g.strategy}|${g.start_date}|${g.end_date}|${g.date}|${g.sweep}`
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
  return (v * 100).toFixed(1) + '%'
}

function pctClass(v: number): string {
  if (!Number.isFinite(v)) return ''
  return v > 0 ? 'val-positive' : v < 0 ? 'val-negative' : ''
}

function goTokenList(g: BacktestGroupRow) {
  router.push({
    name: 'BacktestTokenList',
    query: {
      strategy: g.strategy,
      start_date: g.start_date,
      end_date: g.end_date,
      // 定位到具体这一次历史回测（同区间可能跑过多次）
      date: g.date,
      sweep: String(g.sweep),
    },
  })
}

async function loadRows() {
  loading.value = true
  try {
    // 索引已内嵌展示所需指标，无需逐个拉取 backtest_result.json
    entries.value = await getBacktestIndex()
  } finally {
    loading.value = false
  }
}

onMounted(loadRows)

// dev 期间监听 vite 插件推送的索引更新事件，自动重新加载
if (import.meta.hot) {
  import.meta.hot.on('backtest-index-updated', () => {
    loadRows()
  })
}
</script>

<style scoped lang="scss">
.backtest-overview {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.state {
  padding: 48px;
  text-align: center;
  color: #6b7280;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid #f0f0f0;
}

.filters {
  display: flex;
  align-items: center;
  gap: 16px;
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
</style>

import type { CatalogDay, LivePositionRow } from '@/models/dataset'
import type { Position } from '@/models/position'
import type { OrderPosition, PerformanceMode } from '@/models/performance'
import { dataRepository } from '@/data'
import { mapWithConcurrency } from '@/utils/concurrency'

/** 服务只依赖读取仓位这一项能力，便于测试注入 */
export interface LivePositionSource {
  getLivePositions(day: string, strategy: string, symbol?: string): Promise<LivePositionRow[]>
}

export interface LoadLivePositionsOptions {
  repository?: LivePositionSource
  symbol?: string
}

const LOAD_CONCURRENCY = 6

/**
 * 跨日合并 live_positions.csv。
 *
 * - 每个 (day, strategy) 一次请求，并发 6；
 * - 按 position_id 去重，同键冲突时 CLOSED 优先（平仓值才是最终值）；
 * - position_id 缺失时回退 (strategy, symbol, entryTime) 组合键。
 */
export async function loadLivePositions(
  days: CatalogDay[],
  options: LoadLivePositionsOptions = {},
): Promise<LivePositionRow[]> {
  const repository = options.repository ?? dataRepository
  const tasks = days.flatMap((day) =>
    day.strategies.map((strategy) => ({ day: day.day, strategy })),
  )
  if (tasks.length === 0) return []

  const chunks = await mapWithConcurrency(tasks, LOAD_CONCURRENCY, (task) =>
    repository.getLivePositions(task.day, task.strategy, options.symbol),
  )
  return dedupeLivePositions(chunks.flat())
}

/** 跨日快照去重（保留 CLOSED） */
export function dedupeLivePositions(rows: LivePositionRow[]): LivePositionRow[] {
  const byKey = new Map<string, LivePositionRow>()
  for (const row of rows) {
    const key = row.positionId
      ? `id|${row.positionId}`
      : `${row.strategy}|${row.symbol}|${row.entryTime}`
    const previous = byKey.get(key)
    if (!previous || (previous.status !== 'CLOSED' && row.status === 'CLOSED')) {
      byKey.set(key, row)
    }
  }
  return [...byKey.values()]
}

function toPerformanceMode(mode: LivePositionRow['tradingMode']): PerformanceMode {
  return mode === 'live' || mode === 'paper_trading' || mode === 'smoking' ? mode : 'unknown'
}

/**
 * 新版仓位 → 现有页面使用的 OrderPosition 口径。
 *
 * 新版数据只包含期货仓位，故 pos_type 固定 2；deleted 仍表示“是否已平仓”，
 * PNL 使用 realized_pnl（金额，不做百分比换算）。
 */
export function toOrderPosition(row: LivePositionRow): OrderPosition {
  return {
    id: row.positionId || undefined,
    asset: row.symbol,
    strategy_name: row.strategy,
    pos_type: 2,
    pnl_value: row.realizedPnl ?? 0,
    deleted: row.status === 'CLOSED' ? 1 : 0,
    created_at: row.entryTime,
    close_time: row.exitTime,
    leverage: row.leverage,
    trading_mode: toPerformanceMode(row.tradingMode),
  }
}

/**
 * 新版仓位 → K 线页 Position 口径。
 *
 * 图表使用百分数（pnl_pct），不是金额 realized_pnl；最大浮盈/回撤同样取
 * max_pnl_pct / min_pnl_pct。
 */
export function toChartPosition(row: LivePositionRow): Position {
  return {
    position_id: row.positionId,
    type: row.side,
    entry_time: row.entryTime || null,
    exit_time: row.exitTime,
    entry_price: row.entryPrice ?? 0,
    exit_price: row.exitPrice,
    realized_pnl: row.pnlPct,
    max_potential_pnl: row.maxPnlPct ?? 0,
    max_drawdown: row.minPnlPct ?? 0,
  }
}

/** 跨日合并后直接转成页面口径 */
export async function loadOrderPositions(
  days: CatalogDay[],
  options: LoadLivePositionsOptions = {},
): Promise<OrderPosition[]> {
  const rows = await loadLivePositions(days, options)
  return rows.map(toOrderPosition)
}

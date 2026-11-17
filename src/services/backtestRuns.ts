import type { BacktestGroupRow, BacktestOutputEntry } from '@/models/backtest'
import type { BacktestRunRow, CatalogDay } from '@/models/dataset'
import { dataRepository } from '@/data'
import type { GetRunsOptions } from '@/data/repository/frontendDataRepository'
import { mapWithConcurrency } from '@/utils/concurrency'

/** 服务只依赖按天读取 runs 这一项能力，便于测试注入 */
export interface BacktestRunsSource {
  getDayRuns(day: string, options?: GetRunsOptions): Promise<BacktestRunRow[]>
}

export interface LoadBacktestRunsOptions {
  repository?: BacktestRunsSource
  source?: string
  latestOnly?: boolean
}

export interface BacktestRunGroupRow extends BacktestGroupRow {
  /** 批次标识；同一策略同批次的多标的归为一行 */
  batch_id: string
  /** 数据所属日期（data_day），用于回查 {day}/backtest_runs.csv */
  day: string
}

const LOAD_CONCURRENCY = 6

/** 按天并发读取 backtest_runs.csv，并按 source / is_latest 过滤 */
export async function loadBacktestRuns(
  days: CatalogDay[],
  options: LoadBacktestRunsOptions = {},
): Promise<BacktestRunRow[]> {
  if (days.length === 0) return []
  const repository = options.repository ?? dataRepository
  const latestOnly = options.latestOnly ?? true

  const chunks = await mapWithConcurrency(days, LOAD_CONCURRENCY, (day) =>
    repository.getDayRuns(day.day, { latestOnly, source: options.source }),
  )

  return chunks
    .flat()
    .filter(
      (row) =>
        (!latestOnly || row.isLatest) &&
        (!options.source || row.source === options.source),
    )
}

function runTime(run: BacktestRunRow): string {
  const separator = run.runStamp.indexOf('T')
  return separator >= 0 ? run.runStamp.slice(separator + 1) : ''
}

/** run 行 → 复用现有列表分组/展示的索引条目结构 */
export function toBacktestOutputEntry(run: BacktestRunRow): BacktestOutputEntry {
  return {
    strategy: run.strategy,
    symbol: run.symbol,
    date: run.runDay || run.day,
    time: runTime(run),
    // 新版详情按 day/strategy/runStamp/symbol 定位，不再使用目录 path
    path: '',
    sweep: run.sweep,
    start_date: run.startDate,
    end_date: run.endDate,
    completed_at: run.completedAt,
    signals_processed: run.signalsProcessed,
    metrics: {
      annualized_return: run.annualizedReturn,
      roe: run.roe,
      total_return: run.totalReturn,
      max_drawdown: run.maxDrawdown,
      win_rate: run.winRate,
      total_trades: run.totalTrades,
      sharpe_ratio: run.sharpeRatio,
    },
  }
}

/**
 * 按 `strategy + batch_id` 聚合列表行。
 *
 * 同一天可能启动多批回测（batch_id 不同、sweep 都是 0），因此不能沿用按 sweep
 * 分组的旧逻辑；同一批次内各标的分属不同 run_stamp，也不应拆行。
 */
export interface GroupBacktestRunsOptions {
  includeEmpty?: boolean
  /**
   * batch：每日回放按批次分组（同一批次的多个标的合成一行）；
   * runDay：策略发现按 策略+区间+运行日 分组（discovery 每个标的 batch 不同）。
   */
  groupBy?: 'batch' | 'runDay'
}

export function groupBacktestRuns(
  rows: BacktestRunRow[],
  options: GroupBacktestRunsOptions = {},
): BacktestRunGroupRow[] {
  const groups = new Map<string, BacktestRunGroupRow>()
  const roeAcc = new Map<string, { sum: number; count: number }>()

  for (const row of rows) {
    if (!options.includeEmpty && row.signalsProcessed === 0) continue

    const batchId = row.batchId || row.runId || row.runStamp
    const key =
      options.groupBy === 'runDay'
        ? `${row.strategy}|${row.startDate}|${row.endDate}|${row.runDay || row.day}`
        : `${row.strategy}|${batchId}`
    let group = groups.get(key)
    if (!group) {
      group = {
        strategy: row.strategy,
        symbols: [],
        best_roe: -Infinity,
        avg_roe: NaN,
        start_date: row.startDate || '?',
        end_date: row.endDate || '?',
        date: row.runDay || row.day,
        sweep: row.sweep,
        completed_at: '',
        token_entries: [],
        batch_id: batchId,
        day: row.day,
      }
      groups.set(key, group)
      roeAcc.set(key, { sum: 0, count: 0 })
    }

    group.symbols.push(row.symbol)
    group.token_entries.push(toBacktestOutputEntry(row))

    if (Number.isFinite(row.roe)) {
      group.best_roe = Math.max(group.best_roe, row.roe)
      const acc = roeAcc.get(key)
      if (acc) {
        acc.sum += row.roe
        acc.count += 1
      }
    }

    const completedAt = row.completedAt || `${row.runDay || row.day}T${runTime(row)}`
    if (completedAt > group.completed_at) group.completed_at = completedAt
  }

  for (const [key, group] of groups) {
    group.symbols.sort()
    const acc = roeAcc.get(key)
    if (acc && acc.count > 0) group.avg_roe = acc.sum / acc.count
  }

  return Array.from(groups.values()).sort((a, b) =>
    b.completed_at.localeCompare(a.completed_at),
  )
}

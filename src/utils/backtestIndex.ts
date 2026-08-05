import type { BacktestOutputEntry } from '../models/backtest.ts'

/**
 * 原始扫描到的 run（backtest_output 目录树的一条叶子）
 */
export interface RawRun {
  strategy: string
  symbol: string
  date: string // YYYYMMDD
  time: string // HHMMSS
  hasResult: boolean // 是否存在 backtest_result.json
}

/**
 * 从原始 run 列表构建索引：每个 (策略, 代币) 取最新有 result.json 的 run。
 *
 * "最新" = date 最大，同 date 内 time 最大
 *（YYYYMMDD / HHMMSS 定长，字典序即时间序）。
 *
 * 无 result.json 的 run 不参与--未完成的回测不展示。
 *
 * @param runs 扫描到的全部 run
 * @returns 去重后的索引条目，按 strategy、symbol 排序
 */
export function buildIndex(runs: RawRun[]): BacktestOutputEntry[] {
  const latest = new Map<string, RawRun>()

  for (const run of runs) {
    if (!run.hasResult) continue
    const key = `${run.strategy}|${run.symbol}`
    const current = latest.get(key)
    if (!current || isNewer(run, current)) {
      latest.set(key, run)
    }
  }

  return Array.from(latest.values())
    .map(toEntry)
    .sort(compareEntry)
}

/** run a 是否比 run b 更新（date 优先，其次 time） */
function isNewer(a: RawRun, b: RawRun): boolean {
  if (a.date !== b.date) return a.date > b.date
  return a.time > b.time
}

/** RawRun 转为索引条目（计算 path） */
function toEntry(run: RawRun): BacktestOutputEntry {
  return {
    strategy: run.strategy,
    symbol: run.symbol,
    date: run.date,
    time: run.time,
    path: `${run.strategy}/${run.date}/${run.time}/${run.symbol}`,
  }
}

/** 索引条目排序：先策略后代币 */
function compareEntry(a: BacktestOutputEntry, b: BacktestOutputEntry): number {
  if (a.strategy !== b.strategy) return a.strategy.localeCompare(b.strategy)
  return a.symbol.localeCompare(b.symbol)
}

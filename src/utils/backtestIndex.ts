import type {
  BacktestGroupRow,
  BacktestOutputEntry,
  BacktestSummaryMetrics,
} from '../models/backtest.ts'

/**
 * 原始扫描到的 run（backtest_output 目录树的一条叶子）
 *
 * 摘要字段（start_date 及之后）由索引生成器从 backtest_result.json 读出，
 * 解析失败时缺失--列表页对应单元格显示 "-"。
 */
export interface RawRun {
  strategy: string
  symbol: string
  date: string // YYYYMMDD
  time: string // HHMMSS
  hasResult: boolean // 是否存在 backtest_result.json
  start_date?: string
  end_date?: string
  completed_at?: string
  signals_processed?: number
  metrics?: BacktestSummaryMetrics
}

/**
 * 从原始 run 列表构建索引：保留**全部**历史 run。
 *
 * 同一 (策略, 代币) 的多次回测各占一条，不做去重。
 * 无 result.json 的 run 不参与--未完成的回测不展示。
 *
 * 每条附带 `sweep`（同日轮次），用于把"同一天内对同一代币的重跑"
 * 拆分成不同的列表行，详见 assignSweeps。
 *
 * @param runs 扫描到的全部 run
 * @returns 索引条目数组，按完成时间倒序
 */
export function buildIndex(runs: RawRun[]): BacktestOutputEntry[] {
  const complete = runs.filter(run => run.hasResult)
  return assignSweeps(complete).sort(compareByCompletedDesc)
}

/**
 * 按 (策略, 运行日期) 分组，为组内每个 run 分配同日轮次 sweep。
 *
 * 脚本逐代币启动回测，同一批次的 HHMMSS 相差仅几秒，因此不能按 HHMMSS 分行
 * （会把一批 10 个代币炸成 10 行）。改为贪心分配：按 time 升序，每个 run 归入
 * 第一个"尚无该代币"的轮次，否则新开一个轮次。
 *
 * 效果：一天只跑一轮 → 全部 sweep 0，聚合成一行；
 * 同一代币当天重跑 → 落到 sweep 1，拆成独立的一行。
 */
function assignSweeps(runs: RawRun[]): BacktestOutputEntry[] {
  const byStrategyDate = new Map<string, RawRun[]>()
  for (const run of runs) {
    const key = `${run.strategy}|${run.date}`
    const bucket = byStrategyDate.get(key)
    if (bucket) {
      bucket.push(run)
    } else {
      byStrategyDate.set(key, [run])
    }
  }

  const entries: BacktestOutputEntry[] = []
  for (const bucket of byStrategyDate.values()) {
    // 轮次按 time 升序分配，保证早跑的进 sweep 0
    const ordered = [...bucket].sort((a, b) => a.time.localeCompare(b.time))
    const sweeps: Set<string>[] = []
    for (const run of ordered) {
      let sweep = sweeps.findIndex(taken => !taken.has(run.symbol))
      if (sweep === -1) {
        sweeps.push(new Set())
        sweep = sweeps.length - 1
      }
      sweeps[sweep].add(run.symbol)
      entries.push(toEntry(run, sweep))
    }
  }
  return entries
}

/**
 * 把索引条目分组成策略发现列表页的行。
 *
 * 分组键 = `strategy | start_date | end_date | date | sweep`：
 * 同一策略的同一回测区间，若在不同日期运行或同日重跑，各自成独立行，
 * 从而保留全部历史记录。
 *
 * @param entries 索引条目（通常来自 buildIndex 或索引文件）
 * @returns 分组行，按完成时间倒序
 */
export function groupRuns(entries: BacktestOutputEntry[]): BacktestGroupRow[] {
  const map = new Map<string, BacktestGroupRow>()

  for (const entry of entries) {
    // 空回测不展示
    if (entry.signals_processed === 0) continue

    const startDate = entry.start_date ?? '?'
    const endDate = entry.end_date ?? '?'
    // 旧索引文件没有 sweep 字段，视为 0（全部归入同一轮次）
    const sweep = entry.sweep ?? 0
    const key = `${entry.strategy}|${startDate}|${endDate}|${entry.date}|${sweep}`

    let row = map.get(key)
    if (!row) {
      row = {
        strategy: entry.strategy,
        symbols: [],
        best_annualized: -Infinity,
        start_date: startDate,
        end_date: endDate,
        date: entry.date,
        sweep,
        completed_at: '',
        token_entries: [],
      }
      map.set(key, row)
    }

    row.symbols.push(entry.symbol)
    row.token_entries.push(entry)

    const annualized = entry.metrics?.annualized_return
    if (typeof annualized === 'number' && Number.isFinite(annualized)) {
      row.best_annualized = Math.max(row.best_annualized, annualized)
    }

    const completedAt = completedKey(entry)
    if (completedAt > row.completed_at) row.completed_at = completedAt
  }

  for (const row of map.values()) {
    row.symbols.sort()
  }

  return Array.from(map.values()).sort((a, b) => b.completed_at.localeCompare(a.completed_at))
}

/** 完成时间排序键：end_time 优先，缺失时回退为 `${date}T${time}` */
function completedKey(entry: { completed_at?: string; date: string; time: string }): string {
  return entry.completed_at || `${entry.date}T${entry.time}`
}

/**
 * 每个代币只保留最新的一次回测。
 *
 * 用于兼容缺少 date/sweep 参数的旧链接：此时无法定位到具体某一次历史回测，
 * 退化为按区间匹配，但必须去重--否则同一代币会因多次历史回测而重复成行
 * （代币列表以 symbol 作为渲染 key，重复会导致渲染异常）。
 *
 * @param entries 同一策略/区间下的索引条目
 * @returns 每个代币一条，取完成时间最新者
 */
export function pickLatestPerSymbol(entries: BacktestOutputEntry[]): BacktestOutputEntry[] {
  const latest = new Map<string, BacktestOutputEntry>()
  for (const entry of entries) {
    const current = latest.get(entry.symbol)
    if (!current || completedKey(entry) > completedKey(current)) {
      latest.set(entry.symbol, entry)
    }
  }
  return Array.from(latest.values())
}

/** 索引条目排序：完成时间倒序 */
function compareByCompletedDesc(a: BacktestOutputEntry, b: BacktestOutputEntry): number {
  return completedKey(b).localeCompare(completedKey(a))
}

/** RawRun 转为索引条目（计算 path，透传摘要字段） */
function toEntry(run: RawRun, sweep: number): BacktestOutputEntry {
  return {
    strategy: run.strategy,
    symbol: run.symbol,
    date: run.date,
    time: run.time,
    path: `${run.strategy}/${run.date}/${run.time}/${run.symbol}`,
    sweep,
    start_date: run.start_date,
    end_date: run.end_date,
    completed_at: run.completed_at,
    signals_processed: run.signals_processed,
    metrics: run.metrics,
  }
}

import { FRONTEND_DATA_BASE_URL } from '@/config/frontendData'
import { extractDisplayPrefix } from '@/models/runtime'
import type { Runtime, RuntimeStatus, TradingMode } from '@/models/runtime'
import type { Position } from '@/models/position'
import type { SignalComparison } from '@/models/detail'
import type { BacktestTrade } from '@/models/backtest'
import type { KlinePoint } from '@/models/kline'
import { enumerateDates } from '@/utils/dateRange'
import { parseCsv } from '@/utils/csv'

// ────────────────────────────────────────────────────────────────────
// manifest.json
// ────────────────────────────────────────────────────────────────────
interface ManifestEntry {
  strategy: string
  symbol: string
  trading_mode: string
  runtime_name: string
  status: string
  source_strategy: string
}

interface Manifest {
  date: string
  strategies: ManifestEntry[]
}

function normalizeTradingMode(raw: string): TradingMode {
  switch (raw) {
    case 'live': return 'live'
    case 'paper':
    case 'paper_trading': return 'paper_trading'
    case 'smoking': return 'smoking'
    default: return 'unknown'
  }
}

function normalizeStatus(raw: string): RuntimeStatus {
  if (raw === 'success' || raw === 'failed') return raw
  return 'unknown'
}

/**
 * 获取策略运行实例列表（来自 frontend_data 的 manifest.json）
 *
 * manifest 中的命名已由 Python 脚本统一为实盘真实名称，
 * 因此前端不再需要 runtime_name 映射。
 * @param date 日期字符串，如 '20260806'
 */
export async function getRuntimes(date: string): Promise<Runtime[]> {
  try {
    const response = await fetch(`${FRONTEND_DATA_BASE_URL}/${date}/manifest.json`)
    if (!response.ok) return []
    const manifest: Manifest = await response.json()
    if (!manifest.strategies) return []

    const seen = new Set<string>()
    const runtimes: Runtime[] = []

    for (const entry of manifest.strategies) {
      // 同一 (dir_name, symbol) 去重
      const key = `${entry.strategy}/${entry.symbol}`
      if (seen.has(key)) continue
      seen.add(key)

      runtimes.push({
        runtime_name: entry.runtime_name,
        dir_name: entry.strategy,
        strategy: entry.source_strategy || entry.strategy,
        symbol: entry.symbol,
        trading_mode: normalizeTradingMode(entry.trading_mode),
        status: normalizeStatus(entry.status),
        display_name: extractDisplayPrefix(entry.runtime_name),
      })
    }

    return runtimes
  } catch {
    return []
  }
}

/**
 * 获取日期区间内所有 manifest 的运行实例（扁平合并）。
 *
 * 区间统计需要跨多日按 生产/冒烟 模式过滤仓位，而 manifest 是按日生成的，
 * 因此遍历区间内每一天调用 getRuntimes，扁平返回全部 Runtime[]
 * （不去重——由 utils/modeFilter.buildModeMap 在 (dir_name|asset) 维度
 *  并集去重）。任一日 fetch 失败静默跳过。
 *
 * @param createdFrom RFC3339 起始时间
 * @param createdTo   RFC3339 结束时间
 */
export async function getRuntimesForDateRange(
  createdFrom: string,
  createdTo: string,
): Promise<Runtime[]> {
  const dates = enumerateDates(createdFrom, createdTo)
  if (dates.length === 0) return []
  const perDay = await Promise.all(dates.map((d) => getRuntimes(d)))
  return perDay.flat()
}

// ────────────────────────────────────────────────────────────────────
// positions.json
// ────────────────────────────────────────────────────────────────────

/**
 * 获取持仓数据
 * @param dirName frontend_data 下的策略目录名（如 DOLPHINV2_4H_2）
 * @param symbol 交易对（如 BTCUSDT）
 * @param date 日期字符串（如 20260806）
 * @returns 持仓数组，文件不存在或无仓位时返回空数组
 */
export async function getPositions(dirName: string, symbol: string, date: string): Promise<Position[]> {
  try {
    const response = await fetch(`${FRONTEND_DATA_BASE_URL}/${date}/${dirName}/${symbol}/positions.json`)
    if (!response.ok) return []
    const data: unknown = await response.json()
    return parsePositions(data)
  } catch {
    return []
  }
}

function parsePositions(json: unknown): Position[] {
  if (!Array.isArray(json)) return []
  return json.flatMap((raw): Position[] => {
    if (!raw || typeof raw !== 'object') return []
    const r = raw as Record<string, unknown>
    return [{
      position_id: String(r.position_id ?? ''),
      type: r.type === 'short' ? 'short' : 'long',
      entry_time: r.entry_time == null ? null : String(r.entry_time),
      exit_time: r.exit_time == null ? null : String(r.exit_time),
      entry_price: toNumber(r.entry_price),
      exit_price: r.exit_price == null ? null : toNumber(r.exit_price),
      realized_pnl: r.realized_pnl == null ? null : toNumber(r.realized_pnl),
      max_potential_pnl: toNumber(r.max_potential_pnl),
      max_drawdown: toNumber(r.max_drawdown),
    }]
  })
}

// ────────────────────────────────────────────────────────────────────
// backtest.json
// ────────────────────────────────────────────────────────────────────

/**
 * 获取回放交易数据
 * @param date 日期字符串（如 20260806）
 * @param dirName 策略目录名（如 DOLPHINV2_4H_2）
 * @param symbol 交易对（如 BTCUSDT）
 * @returns 回放交易记录数组，无数据时返回空数组
 */
export async function getBacktestTrades(
  date: string,
  dirName: string,
  symbol: string,
): Promise<BacktestTrade[]> {
  try {
    const response = await fetch(`${FRONTEND_DATA_BASE_URL}/${date}/${dirName}/${symbol}/backtest.json`)
    if (!response.ok) return []
    const data: unknown = await response.json()
    return parseBacktestTrades(data)
  } catch {
    return []
  }
}

function parseBacktestTrades(json: unknown): BacktestTrade[] {
  if (!Array.isArray(json)) return []
  return json.flatMap((raw): BacktestTrade[] => {
    if (!raw || typeof raw !== 'object') return []
    const r = raw as Record<string, unknown>
    return [{
      timestamp: String(r.timestamp ?? ''),
      side: String(r.side ?? 'BUY') as BacktestTrade['side'],
      price: toNumber(r.price),
      pnl: toNumber(r.pnl),
    }]
  })
}

// ────────────────────────────────────────────────────────────────────
// comparison.json
// ────────────────────────────────────────────────────────────────────

/**
 * 获取信号对比数据
 * @param dirName 策略目录名（如 DOLPHINV2_4H_2）
 * @param symbol 交易对（如 BTCUSDT）
 * @param date 日期字符串（如 20260806）
 */
export async function getComparison(
  dirName: string,
  symbol: string,
  date: string,
): Promise<SignalComparison> {
  const response = await fetch(`${FRONTEND_DATA_BASE_URL}/${date}/${dirName}/${symbol}/comparison.json`)
  if (!response.ok) {
    throw new Error(`Failed to fetch comparison: ${response.status}`)
  }
  return response.json()
}

// ────────────────────────────────────────────────────────────────────
// K线（v1 详情页仍使用 pnl/kline CSV，来自 signal_comparison_output）
// ────────────────────────────────────────────────────────────────────

/**
 * 获取K线数据（v1 详情页使用）
 * @param runtime_name 运行实例名称
 * @param date 日期字符串
 */
export async function getKline(runtime_name: string, date: string): Promise<KlinePoint[]> {
  try {
    const response = await fetch(`/data/${date}/pnl/kline/${runtime_name}/${date}.csv`)
    if (!response.ok) return []
    const text = await response.text()
    return parseKline(text)
  } catch {
    return []
  }
}

function parseKline(csv: string): KlinePoint[] {
  const rows = parseCsv(csv)
  return rows
    .filter((row) => row.timestamp && row.datetime)
    .map((row) => ({
      timestamp: parseInt(row.timestamp, 10),
      datetime: row.datetime,
      open: parseFloat(row.open) || 0,
      high: parseFloat(row.high) || 0,
      low: parseFloat(row.low) || 0,
      close: parseFloat(row.close) || 0,
      position_id: row.position_id || '',
      entry_price: parseFloat(row.entry_price) || 0,
      position_type: (row.position_type === 'short' ? 'short' : 'long') as 'long' | 'short',
      pnl_pct: parseFloat(row.pnl_pct) || 0,
      is_entry: row.is_entry === 'True',
      is_exit: row.is_exit === 'True',
    }))
}

// ────────────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────────────

function toNumber(value: unknown): number {
  if (value == null || value === '') return 0
  const n = Number(value)
  return Number.isNaN(n) ? 0 : n
}

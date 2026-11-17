import { FRONTEND_DATA_BASE_URL } from '@/config/frontendData'
import { dataRepository } from '@/data'
import { toChartPosition } from '@/services/livePerformance'
import type { Runtime, RuntimeStatus, TradingMode } from '@/models/runtime'
import type { Position } from '@/models/position'
import type { SignalComparison } from '@/models/detail'
import type { BacktestTrade } from '@/models/backtest'
import type { KlinePoint } from '@/models/kline'
import { parseCsv } from '@/utils/csv'

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
 * 获取策略运行实例列表（frontend-data v2: {day}/manifest.csv）。
 *
 * strategy 统一取策略目录名（如 DEMO_MA_2H_1），source_strategy 只用于展示兜底。
 * 新增策略不再需要前端配置任何名称映射。
 */
export async function getRuntimes(date: string): Promise<Runtime[]> {
  const entries = await dataRepository.getDayManifest(date)
  const seen = new Set<string>()
  const runtimes: Runtime[] = []

  for (const entry of entries) {
    // 每日收益是实盘页：纯回测（has_live=0）的策略不进入该列表
    if (!entry.hasLive) continue
    const key = `${entry.strategy}/${entry.symbol}`
    if (seen.has(key)) continue
    seen.add(key)

    runtimes.push({
      runtime_name: entry.runtimeName || `${entry.strategy}_${entry.symbol}`,
      dir_name: entry.strategy,
      strategy: entry.strategy,
      symbol: entry.symbol,
      trading_mode: normalizeTradingMode(entry.tradingMode),
      status: normalizeStatus(entry.status),
      display_name: entry.displayName || entry.sourceStrategy || entry.strategy,
    })
  }

  return runtimes
}

/**
 * 获取某策略某标的的实盘仓位（{day}/{strategy}/live_positions.csv）。
 *
 * 文件是策略级、行级带 symbol；这里按 symbol 过滤并转成 K 线页 Position
 * （realized_pnl 取 pnl_pct 百分数）。
 */
export async function getPositions(
  dirName: string,
  symbol: string,
  date: string,
): Promise<Position[]> {
  const rows = await dataRepository.getLivePositions(date, dirName, symbol)
  return rows.map(toChartPosition)
}

// ────────────────────────────────────────────────────────────────────
// v1 详情页遗留读取（/detail/:strategy/:symbol），暂保留旧路径。
// v2 详情页使用 TokenDetailV2，不再调用以下函数。
// ────────────────────────────────────────────────────────────────────

/** 获取回放交易数据（v1） */
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

/** 获取信号对比数据（v1） */
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

/** 获取K线数据（v1） */
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

function toNumber(value: unknown): number {
  if (value == null || value === '') return 0
  const n = Number(value)
  return Number.isNaN(n) ? 0 : n
}

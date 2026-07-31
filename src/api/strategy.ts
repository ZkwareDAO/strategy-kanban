import { load as yamlLoad } from 'js-yaml'
import { parsePositionSummary, parseKline } from '@/utils/csv'
import type { Runtime } from '@/models/runtime'
import { mapRuntimeName, extractDisplayPrefix, PREFIX_STRATEGY_MAP } from '@/models/runtime'
import type { Position } from '@/models/position'
import type { KlinePoint } from '@/models/kline'
import type { SignalComparison } from '@/models/detail'
import type { BacktestTrade, BacktestSignal } from '@/models/backtest'

/**
 * 获取仓位数据索引
 * @param date 日期字符串
 * @returns 有数据的 runtime 列表
 */
export async function getPositionsIndex(date: string): Promise<Runtime[]> {
  try {
    const response = await fetch(`/data/${date}/pnl/positions_index.json`)
    if (!response.ok) {
      return []
    }

    const data = await response.json()
    return data.runtimes.map((r: { runtime_name: string; strategy: string; symbol: string; trading_mode: string }) => ({
      runtime_name: r.runtime_name,
      strategy: r.strategy,
      symbol: r.symbol,
      trading_mode: r.trading_mode as 'live' | 'paper_trading' | 'smoking',
      status: 'success' as const,
      display_name: extractDisplayPrefix(r.runtime_name),
      has_data: true,
    }))
  } catch (err) {
    return []
  }
}

/**
 * 获取策略运行实例列表
 * 合并 manifest（所有策略）和 positions_index（有仓位的策略）
 * manifest 中的 runtime_name 会通过映射转换为实际目录名
 * @param date 日期字符串，如: '20260720'
 * @returns 运行实例数组
 */
export async function getRuntimes(date: string): Promise<Runtime[]> {
  // 并行获取 manifest 和 positions_index
  const [manifestRuntimes, positionsRuntimes] = await Promise.all([
    getManifestRuntimes(date),
    getPositionsIndex(date),
  ])

  // 用映射后的 runtime_name 去重合并
  const seen = new Set<string>()
  const merged: Runtime[] = []

  // 先加入有仓位的数据（优先）
  for (const r of positionsRuntimes) {
    if (!seen.has(r.runtime_name)) {
      seen.add(r.runtime_name)
      merged.push(r)
    }
  }

  // 再加入 manifest 中的（无仓位的策略）
  for (const r of manifestRuntimes) {
    if (!seen.has(r.runtime_name)) {
      seen.add(r.runtime_name)
      merged.push(r)
    }
  }

  return merged
}

/**
 * 从 manifest.yaml 获取所有 runtime，并映射 runtime_name
 */
async function getManifestRuntimes(date: string): Promise<Runtime[]> {
  try {
    const response = await fetch(`/data/${date}/manifest.yaml`)
    if (!response.ok) return []
    const text = await response.text()
    const data = yamlLoad(text) as { tasks: Array<{ runtime_name: string; strategy: string; symbol: string; status: string }> }

    return data.tasks.map((task) => {
      const mappedName = mapRuntimeName(task.runtime_name)
      return {
        runtime_name: mappedName,
        strategy: task.strategy,
        symbol: task.symbol,
        trading_mode: extractMode(mappedName),
        status: task.status as 'success' | 'failed',
        display_name: extractDisplayPrefix(mappedName),
        has_data: false,
      }
    })
  } catch {
    return []
  }
}

/**
 * 扫描实际数据目录，获取有数据的 runtime 列表
 * 通过尝试获取目录下的 CSV 文件来判断
 * @param date 日期字符串
 * @param manifestRuntimes manifest 中的 runtime 列表（可选）
 * @returns runtime 名称数组
 */
export async function scanDataDirectories(date: string, manifestRuntimes?: Runtime[]): Promise<string[]> {
  // 如果提供了 manifest，检查哪些有实际数据
  if (manifestRuntimes && manifestRuntimes.length > 0) {
    const checks = await Promise.all(
      manifestRuntimes.map(async r => {
        try {
          const response = await fetch(`/data/${date}/pnl/kline/${r.runtime_name}/${date}_summary_table.csv`)
          return response.ok ? r.runtime_name : null
        } catch {
          return null
        }
      })
    )
    return checks.filter((r): r is string => r !== null)
  }

  // 否则返回空数组（无法扫描目录）
  return []
}

/**
 * 从 runtime 名称解析策略信息
 * @param runtime_name 运行实例名称，如 'ICT_1D_4_BTCUSDT_LIVE'
 * @returns 策略名称和交易对
 */
export function parseRuntimeName(runtime_name: string): { strategy: string; symbol: string } {
  // 格式: STRATEGY_TIMEFRAME_VERSION_SYMBOL_MODE
  // 例如: ICT_1D_4_BTCUSDT_LIVE -> strategy: cta_ict_v4, symbol: BTCUSDT
  // 例如: NEWDOLPHIN_4H_1_ZECUSDT_SMOKING -> strategy: new_dolphin, symbol: ZECUSDT

  const parts = runtime_name.split('_')

  // 查找策略前缀（使用统一的映射表）
  let strategyPrefix = parts[0]
  for (const prefix of Object.keys(PREFIX_STRATEGY_MAP)) {
    if (runtime_name.startsWith(prefix + '_') || runtime_name.startsWith(prefix)) {
      strategyPrefix = prefix
      break
    }
  }

  const strategy = PREFIX_STRATEGY_MAP[strategyPrefix] || strategyPrefix.toLowerCase()

  // SYMBOL 通常是倒数第二个部分（在 MODE 之前）
  const symbolIndex = parts.length - 2
  const symbol = parts[symbolIndex] || parts[parts.length - 1].replace('USDT', '') + 'USDT'

  return { strategy, symbol }
}

/**
 * 获取持仓数据
 * @param runtime_name 运行实例名称
 * @param date 日期字符串
 * @returns 持仓数组，如果文件不存在则返回空数组
 */
export async function getPositions(runtime_name: string, date: string): Promise<Position[]> {
  try {
    const response = await fetch(`/data/${date}/pnl/kline/${runtime_name}/${date}_summary_table.csv`)
    if (!response.ok) {
      // 文件不存在，返回空数组
      return []
    }
    const text = await response.text()
    return parsePositionSummary(text)
  } catch (err) {
    // 请求失败，返回空数组
    return []
  }
}

/**
 * 获取K线数据（价格与ROI趋势）
 * @param runtime_name 运行实例名称
 * @param date 日期字符串
 * @returns K线数据点数组
 */
export async function getKline(runtime_name: string, date: string): Promise<KlinePoint[]> {
  const response = await fetch(`/data/${date}/pnl/kline/${runtime_name}/${date}.csv`)
  const text = await response.text()
  return parseKline(text)
}

/**
 * 获取信号对比数据
 * @param strategy 策略名称
 * @param symbol 代币符号
 * @param date 日期字符串
 * @returns 信号对比数据
 */
export async function getComparison(strategy: string, symbol: string, date: string): Promise<SignalComparison> {
  const response = await fetch(`/data/${date}/comparisons/${strategy}_${symbol}.json`)
  if (!response.ok) {
    throw new Error(`Failed to fetch comparison: ${response.status}`)
  }
  return response.json()
}

/**
 * 回测索引条目
 */
interface BacktestIndexEntry {
  strategy: string
  time: string // HHMMSS
  date: string // YYYYMMDD
  symbols: string[]
}

/**
 * 回测索引文件结构
 */
interface BacktestIndex {
  runs: BacktestIndexEntry[]
}

/**
 * 获取回放交易数据
 * @param date 日期字符串
 * @param strategy 策略名称
 * @param symbol 代币符号
 * @returns 回放交易记录数组，如果文件不存在或无数据则返回空数组
 */
export async function getBacktestTrades(date: string, strategy: string, symbol: string): Promise<BacktestTrade[]> {
  try {
    // 1. 尝试从索引文件定位
    const indexPath = `/data/${date}/backtest_results/index.json`
    const indexResponse = await fetch(indexPath)

    if (indexResponse.ok) {
      const index: BacktestIndex = await indexResponse.json()
      const entry = index.runs.find(r => r.strategy === strategy && r.symbols.includes(symbol))

      if (entry) {
        const csvPath = `/data/${date}/backtest_results/${entry.strategy}/${entry.date}/${entry.time}/${symbol}/backtest_trades.csv`
        const csvResponse = await fetch(csvPath)

        if (csvResponse.ok) {
          const text = await csvResponse.text()
          const trades = parseBacktestTrades(text)
          if (trades.length > 0) {
            console.log('[getBacktestTrades] Found via index:', csvPath)
            return trades
          }
        }
      }
    }

    // 2. 索引不存在或未找到，尝试下一天的索引（数据存储在下一天的目录）
    const nextDate = incrementDate(date)
    const nextIndexPath = `/data/${date}/backtest_results/index.json`

    // 如果当天索引失败，尝试从下一天的数据目录读取索引
    // 注意：索引文件在 backtest_results 目录下，而不是日期目录下
    const nextIndexResponse = await fetch(`/data/${nextDate}/backtest_results/index.json`).catch(() => null)

    if (nextIndexResponse?.ok) {
      const index: BacktestIndex = await nextIndexResponse.json()
      const entry = index.runs.find(r => r.strategy === strategy && r.symbols.includes(symbol))

      if (entry) {
        const csvPath = `/data/${nextDate}/backtest_results/${entry.strategy}/${entry.date}/${entry.time}/${symbol}/backtest_trades.csv`
        const csvResponse = await fetch(csvPath)

        if (csvResponse.ok) {
          const text = await csvResponse.text()
          const trades = parseBacktestTrades(text)
          if (trades.length > 0) {
            console.log('[getBacktestTrades] Found via next date index:', csvPath)
            return trades
          }
        }
      }
    }

    console.log('[getBacktestTrades] No data found for', strategy, symbol, date)
    return []
  } catch (err) {
    console.error('Failed to fetch backtest trades:', err)
    return []
  }
}

/**
 * 日期加一天
 * @param date 日期字符串 YYYYMMDD
 * @returns 下一天的日期字符串
 */
function incrementDate(date: string): string {
  const year = parseInt(date.slice(0, 4))
  const month = parseInt(date.slice(4, 6))
  const day = parseInt(date.slice(6, 8))

  const d = new Date(year, month - 1, day)
  d.setDate(d.getDate() + 1)

  const nextYear = d.getFullYear()
  const nextMonth = String(d.getMonth() + 1).padStart(2, '0')
  const nextDay = String(d.getDate()).padStart(2, '0')

  return `${nextYear}${nextMonth}${nextDay}`
}

/**
 * 解析回放交易 CSV 数据
 * @param text CSV 文本
 * @returns 回放交易记录数组
 */
function parseBacktestTrades(text: string): BacktestTrade[] {
  const lines = text.trim().split('\n')

  // 如果只有列名（表头），返回空数组
  if (lines.length <= 1) {
    return []
  }

  const trades: BacktestTrade[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const [
      trade_id,
      strategy_id,
      symbol,
      side,
      quantity,
      price,
      commission,
      slippage,
      pnl,
      timestamp,
      comment
    ] = line.split(',')

    trades.push({
      trade_id,
      strategy_id,
      symbol,
      side: side as BacktestTrade['side'],
      quantity: parseFloat(quantity),
      price: parseFloat(price),
      commission: parseFloat(commission),
      slippage: parseFloat(slippage),
      pnl: parseFloat(pnl),
      timestamp,
      comment
    })
  }

  return trades
}

/**
 * 从运行实例名称中提取交易模式
 * @param runtime_name 运行实例名称
 * @returns 交易模式
 * @example
 * extractMode('ICT_1D_4_BTCUSDT_LIVE') // 'live'
 * extractMode('RBREAKER_15M_3_BTCUSDT_PAPER') // 'paper_trading'
 * extractMode('TEST_BTCUSDT_SMOKING') // 'smoking'
 */
function extractMode(runtime_name: string): 'live' | 'paper_trading' | 'smoking' {
  if (runtime_name.includes('_LIVE')) return 'live'
  if (runtime_name.includes('_PAPER')) return 'paper_trading'
  return 'smoking'
}

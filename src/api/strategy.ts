import { load as yamlLoad } from 'js-yaml'
import { parsePositionSummary, parseKline } from '@/utils/csv'
import type { Runtime } from '@/models/runtime'
import type { Position } from '@/models/position'
import type { KlinePoint } from '@/models/kline'
import type { SignalComparison } from '@/models/detail'
import type { BacktestTrade, BacktestSignal } from '@/models/backtest'

/**
 * 获取策略运行实例列表
 * @param date 日期字符串，如: '20260720'
 * @returns 运行实例数组
 */
export async function getRuntimes(date: string): Promise<Runtime[]> {
  const response = await fetch(`/data/${date}/manifest.yaml`)
  const text = await response.text()
  const data = yamlLoad(text) as { tasks: Array<{ runtime_name: string; strategy: string; symbol: string; status: string }> }

  return data.tasks.map((task) => ({
    runtime_name: task.runtime_name,
    strategy: task.strategy,
    symbol: task.symbol,
    trading_mode: extractMode(task.runtime_name),
    status: task.status as 'success' | 'failed',
  }))
}

/**
 * 获取持仓数据
 * @param runtime_name 运行实例名称
 * @param date 日期字符串
 * @returns 持仓数组
 */
export async function getPositions(runtime_name: string, date: string): Promise<Position[]> {
  const response = await fetch(`/data/${date}/pnl/kline/${runtime_name}/${date}_summary_table.csv`)
  const text = await response.text()
  return parsePositionSummary(text)
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

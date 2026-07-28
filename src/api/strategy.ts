import { load as yamlLoad } from 'js-yaml'
import { parsePositionSummary, parseKline } from '@/utils/csv'
import type { Runtime } from '@/models/runtime'
import type { Position } from '@/models/position'
import type { KlinePoint } from '@/models/kline'
import type { SignalComparison } from '@/models/detail'

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

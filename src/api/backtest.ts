import type { BacktestOutputEntry, BacktestOutputIndex, BacktestResult } from '@/models/backtest'

/**
 * 获取回测索引：每个 (策略, 代币) 的最新完整回测定位。
 *
 * 索引由 vite 插件在 dev/build 启动时自动生成到 /backtest-output-index.json，
 * 并在 dev 期间监听 backtest_result.json 落盘自动刷新。
 *
 * @returns 索引条目数组；任何失败均返回空数组（不抛错）
 */
export async function getBacktestIndex(): Promise<BacktestOutputEntry[]> {
  try {
    const response = await fetch('/backtest-output-index.json')
    if (!response.ok) return []
    const data = (await response.json()) as BacktestOutputIndex
    return data.entries ?? []
  } catch {
    return []
  }
}

/**
 * 获取某个 run 的回测结果（backtest_result.json）。
 *
 * @param path 索引条目的 path，如 cta_ict_v3/20260629/101907/BTCUSDT
 * @returns 回测结果；失败或不存在返回 null（不抛错）
 */
export async function getBacktestResult(path: string): Promise<BacktestResult | null> {
  try {
    const response = await fetch(`/backtest-output/${path}/backtest_result.json`)
    if (!response.ok) return null
    return (await response.json()) as BacktestResult
  } catch {
    return null
  }
}

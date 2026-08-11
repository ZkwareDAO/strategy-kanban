import type { BacktestOutputEntry, BacktestOutputIndex, BacktestResult } from '@/models/backtest'

/** 权益曲线数据点 */
export interface EquityPoint {
  date: string
  equity: number
  cash: number
}

/** 日K线收盘价数据点 */
export interface DailyClosePoint {
  date: string
  close: number
}

/**
 * 获取回测索引：每个 (策略, 代币) 的最新完整回测定位。
 *
 * 索引由 vite 插件生成到 /backtest-output-index.json：
 * dev 期间监听回测目录变化后重新生成，并通过 HMR 通道推送
 * `backtest-index-updated` 事件，前端收到后重新调用本函数。
 *
 * @returns 索引条目数组；任何失败均返回空数组（不抛错）
 */
export async function getBacktestIndex(): Promise<BacktestOutputEntry[]> {
  try {
    // 带时间戳绕过浏览器缓存，确保拿到刚重新生成的索引
    const response = await fetch(`/backtest-output-index.json?t=${Date.now()}`, {
      cache: 'no-store',
    })
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

/**
 * 获取回测权益曲线数据（backtest_equity.csv）。
 * @param path 索引条目的 path，如 cta_ict_v3/20260629/101907/BTCUSDT
 * @returns 权益数据点数组；失败返回空数组
 */
export async function getBacktestEquity(path: string): Promise<EquityPoint[]> {
  try {
    const response = await fetch(`/backtest-output/${path}/backtest_equity.csv`)
    if (!response.ok) {
      console.warn(`[backtest-equity] fetch failed: ${response.status} ${response.statusText} for /backtest-output/${path}/backtest_equity.csv`)
      return []
    }
    const text = await response.text()
    // Guard against SPA fallback returning HTML instead of CSV
    if (!text.trim().startsWith('date')) {
      console.warn(`[backtest-equity] unexpected content (not CSV) for /backtest-output/${path}/backtest_equity.csv, first 100 chars:`, text.slice(0, 100))
      return []
    }
    const lines = text.trim().split('\n')
    if (lines.length <= 1) return []
    const result: EquityPoint[] = []
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      const [date, equityStr, cashStr] = line.split(',')
      const equity = parseFloat(equityStr)
      const cash = parseFloat(cashStr)
      if (date && !Number.isNaN(equity) && !Number.isNaN(cash)) {
        result.push({ date, equity, cash })
      }
    }
    return result
  } catch (e) {
    console.warn('[backtest-equity] error:', e)
    return []
  }
}

/**
 * 获取日K线收盘价（从 /kline-data/1d/{symbol}_1d.csv 读取）。
 * @param symbol 交易对，如 BTCUSDT
 * @param startDate 起始日期 YYYY-MM-DD
 * @param endDate 结束日期 YYYY-MM-DD
 * @returns 日线收盘价数据点数组；失败返回空数组
 */
export async function getDailyKlineClose(
  symbol: string,
  startDate: string,
  endDate: string,
): Promise<DailyClosePoint[]> {
  try {
    const response = await fetch(`/kline-data/1d/${symbol}_1d.csv`)
    if (!response.ok) return []
    const text = await response.text()
    const lines = text.trim().split('\n')
    if (lines.length <= 1) return []
    const result: DailyClosePoint[] = []
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      const cols = line.split(',')
      if (cols.length < 5) continue
      // timestamp 格式: "2022-12-30 00:00:00+00:00" → 取日期部分
      const tsRaw = cols[0]
      const date = tsRaw.slice(0, 10)
      if (date < startDate || date > endDate) continue
      const close = parseFloat(cols[4])
      if (!Number.isNaN(close)) {
        result.push({ date, close })
      }
    }
    return result
  } catch {
    return []
  }
}

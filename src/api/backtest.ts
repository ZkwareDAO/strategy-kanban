import { klineService } from '@/services/kline'

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
 * 获取日K线收盘价。
 *
 * 由 klineService 按配置读取（优先聚合 1d，缺失时回退 basePeriod 聚合）。
 */
export async function getDailyKlineClose(
  symbol: string,
  startDate: string,
  endDate: string,
): Promise<DailyClosePoint[]> {
  return klineService.getDailyClose(symbol, startDate, endDate)
}

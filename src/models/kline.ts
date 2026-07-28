/**
 * K线数据点类型定义
 */

/**
 * 时间周期类型
 */
export type TimeframeValue = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d'

/**
 * K线数据点（分钟级）
 * @example
 * const kline: KlinePoint = {
 *   timestamp: 1784505600,
 *   datetime: '2026-07-20 00:00:00',
 *   open: 64694.8,
 *   high: 64702.3,
 *   low: 64635.2,
 *   close: 64636.5,
 *   pnl_pct: -0.3187
 * }
 */
export interface KlinePoint {
  /** 时间戳（秒） */
  timestamp: number
  /** 日期时间字符串 */
  datetime: string
  /** 开盘价 */
  open: number
  /** 最高价 */
  high: number
  /** 最低价 */
  low: number
  /** 收盘价 */
  close: number
  /** 仓位ID */
  position_id: string
  /** 入场价 */
  entry_price: number
  /** 仓位方向 */
  position_type: 'long' | 'short'
  /** ROI (%) */
  pnl_pct: number
  /** 是否开仓点 */
  is_entry: boolean
  /** 是否平仓点 */
  is_exit: boolean
}
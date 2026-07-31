/**
 * K线数据点类型定义
 */

/**
 * 时间周期类型
 */
export type TimeframeValue = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d'

/**
 * 开仓点信息（一根K线上可能有多个开仓点）
 */
export interface EntryInfo {
  /** 仓位ID */
  position_id: string
  /** 仓位方向 */
  position_type: 'long' | 'short'
  /** 入场价 */
  entry_price: number
  /** 开仓精确时间 */
  entry_time?: string
}

/**
 * 平仓点信息（一根K线上可能有多个平仓点）
 */
export interface ExitInfo {
  /** 仓位ID */
  position_id: string
  /** 仓位方向 */
  position_type: 'long' | 'short'
  /** 平仓价（K线收盘价） */
  exit_price: number
  /** 平仓精确时间 */
  exit_time?: string
}

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
  /** 开仓精确时间（重采样后保留） */
  entry_time?: string
  /** 平仓精确时间（重采样后保留） */
  exit_time?: string
  /** 该K线上的所有开仓点（重采样后一根K线可能包含多个开仓点） */
  entries?: EntryInfo[]
  /** 该K线上的所有平仓点（重采样后一根K线可能包含多个平仓点） */
  exits?: ExitInfo[]
}
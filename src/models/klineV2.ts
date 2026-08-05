/**
 * v2 K线数据点类型定义（纯 OHLC，与仓位解耦）
 *
 * 与 [[KlinePoint]] 的区别：不含任何仓位字段（position_id / is_entry / is_exit / pnl_pct 等）。
 * 仓位信息通过 `usePositionOverlay` 在绘图前叠加，无仓位时仍可绘制纯蜡烛图。
 */

/**
 * 原始 K线数据点（来自外部行情 CSV）
 * @example
 * const kline: RawKlinePoint = {
 *   timestamp: 1672396800,
 *   datetime: '2022-12-30 00:00:00',
 *   open: 246.13,
 *   high: 246.31,
 *   low: 246.12,
 *   close: 246.13,
 *   volume: 1544.36,
 * }
 */
export interface RawKlinePoint {
  /** 时间戳（秒，UTC） */
  timestamp: number
  /** 日期时间字符串 YYYY-MM-DD HH:MM:SS（UTC） */
  datetime: string
  /** 开盘价 */
  open: number
  /** 最高价 */
  high: number
  /** 最低价 */
  low: number
  /** 收盘价 */
  close: number
  /** 成交量（部分 CSV 无此列，可选） */
  volume?: number
}

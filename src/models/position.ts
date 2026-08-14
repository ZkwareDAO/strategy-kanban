/**
 * 持仓数据类型定义
 *
 * 数据来源：frontend_data/{date}/{strategy}/{symbol}/positions.json
 * 时间字段使用 ISO 8601 格式（如 2026-08-06T16:45:00+00:00）。
 */

/** 持仓类型 */
export type PositionType = 'long' | 'short'

/**
 * 持仓信息
 * @example
 * const position: Position = {
 *   position_id: 'DOLPHIN_4H_2_BTCUSDT_LIVE_BTCUSDT_1786034700',
 *   type: 'short',
 *   entry_time: '2026-08-06T16:45:00+00:00',
 *   exit_time: '2026-08-06T23:22:02.483106+00:00',
 *   entry_price: 64725.0,
 *   exit_price: 64225.4,
 *   realized_pnl: 0.7719,
 *   max_potential_pnl: 0.7718,
 *   max_drawdown: -0.1058
 * }
 */
export interface Position {
  /** 持仓ID */
  position_id: string
  /** 持仓类型 */
  type: PositionType
  /** 开仓时间（ISO 8601）；跨日仓位在平仓日为 null（当天无真实开仓动作） */
  entry_time: string | null
  /** 平仓时间（ISO 8601），持仓中为 null */
  exit_time: string | null
  /** 入场价格 */
  entry_price: number
  /** 平仓价格，持仓中为 null */
  exit_price: number | null
  /** 实现收益率 (%)，持仓中为 null */
  realized_pnl: number | null
  /** 最大潜在收益 (%) */
  max_potential_pnl: number
  /** 最大回撤 (%) */
  max_drawdown: number
}

/**
 * 标的持仓汇总
 * @example
 * const summary: PositionSummary = {
 *   symbol: 'BTCUSDT',
 *   positions: [...]
 * }
 */
export interface PositionSummary {
  /** 交易对 */
  symbol: string
  /** 持仓列表 */
  positions: Position[]
}

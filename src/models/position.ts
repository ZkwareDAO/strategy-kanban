/**
 * 持仓数据类型定义
 */

/** 持仓类型 */
export type PositionType = 'long' | 'short'

/**
 * 持仓信息
 * @example
 * const position: Position = {
 *   position_id: '1784506500',
 *   type: 'long',
 *   entry_time: '00:15',
 *   exit_time: '05:11', // 可选，持仓中则无
 *   entry_price: 65026.00,
 *   realized_pnl: -1.12,
 *   max_potential_pnl: 1.17,
 *   max_drawdown: -1.98
 * }
 */
export interface Position {
  /** 持仓ID */
  position_id: string
  /** 持仓类型 */
  type: PositionType
  /** 开仓时间 (HH:MM) */
  entry_time: string
  /** 平仓时间 (HH:MM)，可选 */
  exit_time?: string
  /** 入场价格 */
  entry_price: number
  /** 实现收益率 (%) */
  realized_pnl: number
  /** 最大潜在收益 (%) */
  max_potential_pnl: number
  /** 最大回撤 (%) */
  max_drawdown: number
}

/**
 * 代币持仓汇总
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
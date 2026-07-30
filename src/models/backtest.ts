/**
 * 回放交易数据类型定义
 */

/**
 * 回放交易记录
 */
export interface BacktestTrade {
  /** 交易ID */
  trade_id: string
  /** 策略ID */
  strategy_id: string
  /** 交易对 */
  symbol: string
  /** 方向: BUY, SELL, BUY_CLOSE, SELL_CLOSE */
  side: 'BUY' | 'SELL' | 'BUY_CLOSE' | 'SELL_CLOSE'
  /** 数量 */
  quantity: number
  /** 价格 */
  price: number
  /** 手续费 */
  commission: number
  /** 滑点 */
  slippage: number
  /** 盈亏 */
  pnl: number
  /** 时间戳 */
  timestamp: string
  /** 备注 */
  comment: string
}

/**
 * 回放信号点（用于图表显示）
 */
export interface BacktestSignal {
  /** 时间 */
  datetime: string
  /** 价格 */
  price: number
  /** 方向: long/short */
  position_type: 'long' | 'short'
  /** 类型: open/close */
  action: 'open' | 'close'
}
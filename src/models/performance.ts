/** API 原始订单仓位记录 */
export interface OrderPosition {
  id: number
  asset: string
  strategy_name: string
  exchange: string
  side: number
  pos_type: number       // 2=期货, 3=期权
  quantity: number
  pos_price: number
  current_price: number
  pnl_value: number
  leverage: number
  init_margin: number
  pos_value: number
  deleted: number        // 1=已平仓
  created_at: string     // RFC3339 +08:00
  close_time: string     // RFC3339 +08:00
  updated_at: string
  user_id: number
  user_name: string
  user_strategy_id: number
  user_order_id: number
  risk_control_strategy_id: number
  uprunning_order_id: number
}

/** 策略维度汇总 */
export interface StrategyPerformance {
  strategy_name: string
  total_trades: number
  winning_trades: number
  losing_trades: number
  win_rate: number      // 0~1
  total_pnl: number
}

/** 策略+代币维度汇总 */
export interface SymbolPerformance {
  symbol: string        // asset 字段
  total_trades: number
  winning_trades: number
  losing_trades: number
  win_rate: number
  max_profit: number    // 最大单笔盈利
  max_loss: number      // 最大单笔亏损（负数）
  total_pnl: number
}

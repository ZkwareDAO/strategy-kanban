/** 策略表现 CSV 中的一条订单仓位记录（精简字段） */
export interface OrderPosition {
  /** 交易对，如 BTCUSDT */
  asset: string
  /** 策略名，格式 {strategy_dir}_{SYMBOL}，如 NEWOBV_4H_1_BTCUSDT */
  strategy_name: string
  /** 仓位类型：2=期货 */
  pos_type: number
  /** 盈亏金额 */
  pnl_value: number
  /** 是否已平仓：1=已平仓 */
  deleted: number
  /** 开仓时间（RFC 3339） */
  created_at: string
  /** 平仓时间（RFC 3339），持仓中为空 */
  close_time: string | null
  /** 杠杆倍数（API 返回，默认 1） */
  leverage: number
}

/** 交易模式类型（与 runtime.ts 的 TradingMode 一致，避免循环依赖此处内联） */
export type PerformanceMode = 'live' | 'paper_trading' | 'smoking' | 'unknown'

/** 策略维度汇总 */
export interface StrategyPerformance {
  strategy_name: string
  total_trades: number
  winning_trades: number
  losing_trades: number
  win_rate: number      // 0~1
  total_pnl: number
  /** 该策略已平仓位中观察到的最大杠杆（风险视角） */
  max_leverage: number
  /** 该策略在所选模式下的模式标签（live/smoking/...） */
  mode: PerformanceMode
  /**
   * 当日仍持仓的笔数（deleted=0）。
   * 与上面的已实现口径分离统计——持仓中的交易尚未完成，
   * 计入 total_trades/win_rate 会用未定的结果污染已实现指标。
   */
  open_trades?: number
  /** 持仓中仓位的浮盈合计（随行情变动，非最终值） */
  floating_pnl?: number
}

/** 策略+标的维度汇总 */
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

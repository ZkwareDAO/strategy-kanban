/**
 * 页面2 - 代币详情相关类型定义
 */

/** 策略逻辑 */
export interface StrategyLogic {
  entry_conditions: LogicSection
  exit_conditions: LogicSection
  risk_management: LogicSection
}

export interface LogicSection {
  title: string
  rules: string[]
}

/** 价格与ROI时序数据 */
export interface TimelineData {
  timestamp: number
  datetime: string
  open: number
  high: number
  low: number
  close: number
  position_id: string
  entry_price: number
  position_type: 'long' | 'short'
  pnl_pct: number
  intraday_max_pnl: number
  intraday_min_pnl: number
  is_entry: boolean
  is_exit: boolean
  is_holding: boolean
  position_status: 'before' | 'holding' | 'closed' | 'hypothetical'
}

/** 技术指标 */
export interface TechnicalIndicator {
  name: string
  value: string
  signal?: string
}

/** 信号对比 */
export interface SignalComparison {
  strategy: string
  symbol: string
  date: string
  total_live: number
  total_backtest: number
  matched: number
  accuracy_score: number
  recommendation?: string
  time_accuracy?: TimeAccuracy
  price_accuracy?: PriceAccuracy
  signal_id_matched?: number
  time_window_matched?: number
  unmatched_live: Signal[]
  unmatched_backtest: Signal[]
  matched_signals?: MatchedSignal[]
}

export interface TimeAccuracy {
  avg_diff_seconds: number
  max_diff_seconds: number
  std_dev_seconds: number
}

export interface PriceAccuracy {
  avg_diff_pct: number
  max_diff_pct: number
  within_0_1pct?: number
  within_0_5pct?: number
}

export interface Signal {
  signal_id?: string
  live_signal_id?: string
  backtest_signal_id?: string
  time?: string
  timestamp?: string
  side: 'buy' | 'sell'
  /** 权威方向字段：buy=开多 sell=开空 sell_close=平多 buy_close=平空。side 仅供样式，不表示真实方向 */
  action?: 'buy' | 'sell' | 'sell_close' | 'buy_close'
  price?: number
  live_price?: number
  backtest_price?: number
  reason?: string
  match_type?: string
  time_diff_seconds?: number
  price_diff_pct?: number
}

export interface MatchedSignal extends Signal {
  match_type: string
}
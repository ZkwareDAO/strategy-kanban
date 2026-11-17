/**
 * 策略运行实例类型定义
 */

/** 运行模式类型 */
export type TradingMode = 'live' | 'paper_trading' | 'smoking' | 'unknown'

/** 运行状态类型 */
export type RuntimeStatus = 'success' | 'failed' | 'unknown'

/**
 * 策略运行实例
 * @example
 * const runtime: Runtime = {
 *   runtime_name: 'DEMO_TREND_B_4H_2_BTCUSDT_LIVE',
 *   dir_name: 'DEMO_TREND_B_4H_2',
 *   strategy: 'demo_trend_b',
 *   symbol: 'BTCUSDT',
 *   trading_mode: 'live',
 *   status: 'success'
 * }
 */
export interface Runtime {
  /** 运行实例名称，如: DEMO_TREND_B_4H_2_BTCUSDT_LIVE */
  runtime_name: string
  /** frontend_data 下的策略目录名（如 DEMO_TREND_B_4H_2） */
  dir_name: string
  /** 策略内部名（source_strategy），如: demo_trend_b */
  strategy: string
  /** 交易对，如: BTCUSDT */
  symbol: string
  /** 运行模式 */
  trading_mode: TradingMode
  /** 运行状态 */
  status: RuntimeStatus
  /** 显示用策略短名，如: DEMO_TREND_B */
  display_name: string
}

/**
 * 策略汇总信息
 */
export interface StrategySummary {
  /** 策略名称 */
  strategy: string
  /** 显示用策略短名 */
  display_name: string
  /** 总持仓数 */
  position_count: number
  /** 已完成交易数（有平仓时间） */
  completed_count: number
  /** 未完成交易数（持仓中） */
  holding_count: number
  /** 胜率 (%) */
  win_rate: number
  /** 平均ROI (%) */
  avg_roi: number
}

/**
 * 运行模式统计
 */
export interface ModeCounts {
  live: number
  paper_trading: number
  smoking: number
  unknown: number
}

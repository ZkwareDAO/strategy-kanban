/**
 * 策略运行实例类型定义
 */

/** 运行模式类型 */
export type TradingMode = 'live' | 'paper_trading' | 'smoking'

/** 运行状态类型 */
export type RuntimeStatus = 'success' | 'failed'

/**
 * 策略运行实例
 * @example
 * const runtime: Runtime = {
 *   runtime_name: 'ICT_1D_4_BTCUSDT_LIVE',
 *   strategy: 'cta_ict_v4',
 *   symbol: 'BTCUSDT',
 *   trading_mode: 'live',
 *   status: 'success'
 * }
 */
export interface Runtime {
  /** 运行实例名称，如: ICT_1D_4_BTCUSDT_LIVE */
  runtime_name: string
  /** 策略名称，如: cta_ict_v4 */
  strategy: string
  /** 交易对，如: BTCUSDT */
  symbol: string
  /** 运行模式 */
  trading_mode: TradingMode
  /** 运行状态 */
  status: RuntimeStatus
}

/**
 * 策略汇总信息
 * @example
 * const summary: StrategySummary = {
 *   strategy: 'cta_ict_v4',
 *   position_count: 4,
 *   win_rate: 75.0,
 *   avg_roi: 2.35
 * }
 */
export interface StrategySummary {
  /** 策略名称 */
  strategy: string
  /** 持仓数 */
  position_count: number
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
}
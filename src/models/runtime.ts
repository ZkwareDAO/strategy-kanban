/**
 * 策略运行实例类型定义
 */

/** 运行模式类型 */
export type TradingMode = 'live' | 'paper_trading' | 'smoking'

/** 运行状态类型 */
export type RuntimeStatus = 'success' | 'failed'

/**
 * Manifest runtime 前缀 → 实际数据目录前缀 映射
 * 仅用于同一策略的前缀缩写（manifest 用全称，实际目录用缩写）
 * 不同版本的策略不应映射（如 DOLPHIN 和 DOLPHINV2 是两个不同策略）
 */
export const RUNTIME_PREFIX_MAP: Record<string, string> = {
  'EMARSIPULLBACK': 'ERP',
  'REGIMEDONCHIANATR': 'RDATR',
  'VWAPCHANNELMOMENTUM': 'VWAPMOM',
}

/**
 * 实际数据目录前缀 → 策略名 映射
 */
export const PREFIX_STRATEGY_MAP: Record<string, string> = {
  'ICT': 'cta_ict_v4',
  'RBREAKER': 'cta_rbreaker_v3',
  'DOLPHIN': 'dolphin_trading_v2',
  'DOLPHINV2': 'dolphin_trading_v2',
  'OBVATR': 'obv_atr_v2',
  'NEWDOLPHIN': 'new_dolphin',
  'NEWOBV': 'new_obv',
  'ERP': 'ema_rsi_pullback',
  'RDATR': 'regime_donchian_atr',
  'VWAPMOM': 'vwap_channel_momentum',
}

/**
 * 将 manifest runtime_name 转换为实际数据目录的 runtime_name
 * 例如: DOLPHIN_4H_2_BTCUSDT_LIVE → DOLPHINV2_4H_2_BTCUSDT_LIVE
 */
export function mapRuntimeName(runtimeName: string): string {
  for (const [manifestPrefix, actualPrefix] of Object.entries(RUNTIME_PREFIX_MAP)) {
    if (runtimeName.startsWith(manifestPrefix + '_')) {
      return actualPrefix + runtimeName.slice(manifestPrefix.length)
    }
  }
  return runtimeName
}

/**
 * 从 runtime_name 提取显示用的策略短名（映射后的前缀）
 * 例如: VWAPMOM_15M_1_XLMUSDT_SMOKING → VWAPMOM
 *       DOLPHINV2_4H_2_BTCUSDT_LIVE → DOLPHINV2
 */
export function extractDisplayPrefix(runtimeName: string): string {
  for (const prefix of Object.keys(PREFIX_STRATEGY_MAP)) {
    if (runtimeName.startsWith(prefix + '_')) {
      return prefix
    }
  }
  return runtimeName.split('_')[0]
}

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
  /** 显示用策略短名（映射后的前缀），如: VWAPMOM, DOLPHINV2 */
  display_name: string
  /** 是否有实际仓位数据（来自 positions_index） */
  has_data: boolean
}

/**
 * 策略汇总信息
 * @example
 * const summary: StrategySummary = {
 *   strategy: 'cta_ict_v4',
 *   position_count: 4,
 *   completed_count: 2,
 *   holding_count: 1,
 *   win_rate: 75.0,
 *   avg_roi: 2.35
 * }
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
}
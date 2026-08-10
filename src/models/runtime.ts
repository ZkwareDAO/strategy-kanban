/**
 * 策略运行实例类型定义
 */

/** 运行模式类型 */
export type TradingMode = 'live' | 'paper_trading' | 'smoking' | 'unknown'

/** 运行状态类型 */
export type RuntimeStatus = 'success' | 'failed' | 'unknown'

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
  'SAR_SNT3_V3': 'sar_snt3_v3',
}

/**
 * 从 runtime_name 提取显示用的策略短名
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
 *   runtime_name: 'DOLPHINV2_4H_2_BTCUSDT_LIVE',
 *   dir_name: 'DOLPHINV2_4H_2',
 *   strategy: 'dolphin_trading_v2',
 *   symbol: 'BTCUSDT',
 *   trading_mode: 'live',
 *   status: 'success'
 * }
 */
export interface Runtime {
  /** 运行实例名称，如: DOLPHINV2_4H_2_BTCUSDT_LIVE */
  runtime_name: string
  /** frontend_data 下的策略目录名（如 DOLPHINV2_4H_2） */
  dir_name: string
  /** 策略内部名（source_strategy），如: dolphin_trading_v2 */
  strategy: string
  /** 交易对，如: BTCUSDT */
  symbol: string
  /** 运行模式 */
  trading_mode: TradingMode
  /** 运行状态 */
  status: RuntimeStatus
  /** 显示用策略短名，如: DOLPHINV2 */
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

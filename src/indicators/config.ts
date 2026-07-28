/**
 * 技术指标颜色配置
 * 直接从 html_generator/config.py 移植
 */

import type { IndicatorColors } from './types'

export const INDICATOR_COLORS: IndicatorColors = {
  // K线
  bullish: '#26a69a',
  bearish: '#ef5350',

  // OBV
  obv_line: 'purple',
  obv_ma_line: 'orange',
  obv_bullish_fill: 'rgba(76, 175, 80, 0.3)',
  obv_bearish_fill: 'rgba(244, 67, 54, 0.3)',

  // ADX
  adx_line: 'purple',
  adx_threshold: 'red',

  // ATR
  atr_line: '#FF6B00',

  // FVG
  fvg_bullish_fill: 'rgba(76, 175, 80, 0.2)',
  fvg_bearish_fill: 'rgba(244, 67, 54, 0.2)',

  // RSI
  rsi_line: 'purple',

  // MACD
  macd_line: 'blue',
  macd_signal: 'orange',
  macd_hist_pos: 'green',
  macd_hist_neg: 'red',

  // Bollinger
  bb_line: 'blue',

  // Donchian
  donchian_line: '#9C27B0',
  donchian_fill: 'rgba(156, 39, 176, 0.08)',

  // EMA
  ema_fast_line: '#2196F3',
  ema_slow_line: '#FF9800',

  // EFI
  efi_line: '#7B1FA2',
  efi_ma_line: 'orange',
  efi_bullish_fill: 'rgba(76, 175, 80, 0.3)',
  efi_bearish_fill: 'rgba(244, 67, 54, 0.3)',

  // VWAP
  vwap_line: '#E91E63',
  vwap_fill: 'rgba(233, 30, 99, 0.08)',

  // 交易标记
  long_entry: 'blue',
  short_entry: 'orange',
  profit_exit: 'green',
  loss_exit: 'red',
}

/**
 * 指标参数配置
 */
export const INDICATOR_PARAMS = {
  FVG: {
    extend_bars: 10,
  },
  OBV: {
    ma_period: 20,
  },
  ADX: {
    period: 14,
  },
  ATR: {
    period: 14,
  },
  RSI: {
    period: 14,
    upper_threshold: 70.0,
    lower_threshold: 30.0,
  },
  MACD: {
    fast: 12,
    slow: 26,
    signal: 9,
  },
  BB: {
    period: 20,
    std_dev: 2.0,
  },
  Swing: {
    lookback: 5,
  },
  Donchian: {
    period: 120,
  },
  EMA: {
    fast_period: 48,
    slow_period: 120,
  },
  EFI: {
    period: 13,
    ma_period: 13,
  },
  VWAP: {
    period: 96,
    channel_k: 1.5,
    z_lookback: 96,
  },
}

/**
 * 策略指标配置映射
 */
export const STRATEGY_INDICATOR_CONFIG: Record<string, {
  indicators: string[]
  params: Record<string, Record<string, unknown>>
}> = {
REDACTED
    indicators: ['OBV', 'ATR', 'EMA'],
    params: {
REDACTED
REDACTED
REDACTED
    },
  },
REDACTED
    indicators: ['ATR', 'RSI', 'Donchian', 'EMA'],
    params: {
REDACTED
REDACTED
REDACTED
REDACTED
    },
  },
REDACTED
    indicators: ['ATR', 'RSI', 'EMA'],
    params: {
REDACTED
REDACTED
REDACTED
    },
  },
REDACTED
    indicators: ['ATR', 'ADX', 'EMA', 'Donchian'],
    params: {
REDACTED
REDACTED
REDACTED
REDACTED
    },
  },
REDACTED
    indicators: ['ATR', 'FVG', 'Swing'],
    params: {
REDACTED
    },
  },
REDACTED
    indicators: ['OBV', 'EFI', 'ATR', 'EMA'],
    params: {
REDACTED
REDACTED
REDACTED
REDACTED
    },
  },
REDACTED
    indicators: ['VWAP', 'ATR', 'EMA'],
    params: {
REDACTED
REDACTED
REDACTED
    },
  },
}

/**
 * 根据 runtime_name 获取策略名称
 */
export function getStrategyFromRuntime(runtimeName: string): string {
  // OBVATR_4H_2_NEARUSDT_PAPER -> OBVATR
  const parts = runtimeName.split('_')
  return parts[0]
}
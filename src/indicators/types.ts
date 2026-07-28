/**
 * 技术指标类型定义
 */

/**
 * K线数据点
 */
export interface KlinePoint {
  timestamp: number
  datetime: string
  open: number
  high: number
  low: number
  close: number
  volume?: number
  position_id?: string
  entry_price?: number
  position_type?: 'long' | 'short'
  pnl_pct?: number
  is_entry?: boolean
  is_exit?: boolean
}

/**
 * 指标计算结果
 */
export interface IndicatorResult {
  [key: string]: (number | null)[]
}

/**
 * Plotly Trace 配置
 */
export interface PlotlyTrace {
  x?: (string | number)[]
  y?: (number | null)[]
  type: string
  mode?: string
  name: string
  line?: Record<string, unknown>
  marker?: Record<string, unknown>
  fill?: string
  fillcolor?: string
  xaxis?: string
  yaxis?: string
  showlegend?: boolean
  hoverinfo?: string
  hovertext?: string | string[]
  text?: string | string[]
}

/**
 * 指标颜色配置
 */
export interface IndicatorColors {
  // K线
  bullish: string
  bearish: string

  // OBV
  obv_line: string
  obv_ma_line: string
  obv_bullish_fill: string
  obv_bearish_fill: string

  // ADX
  adx_line: string
  adx_threshold: string

  // ATR
  atr_line: string

  // FVG
  fvg_bullish_fill: string
  fvg_bearish_fill: string

  // RSI
  rsi_line: string

  // MACD
  macd_line: string
  macd_signal: string
  macd_hist_pos: string
  macd_hist_neg: string

  // Bollinger
  bb_line: string

  // Donchian
  donchian_line: string
  donchian_fill: string

  // EMA
  ema_fast_line: string
  ema_slow_line: string

  // EFI
  efi_line: string
  efi_ma_line: string
  efi_bullish_fill: string
  efi_bearish_fill: string

  // VWAP
  vwap_line: string
  vwap_fill: string

  // 交易标记
  long_entry: string
  short_entry: string
  profit_exit: string
  loss_exit: string
}

/**
 * Y轴配置
 */
export interface YAxisConfig {
  title?: string
  range?: [number, number]
  position?: 'left' | 'right'
}
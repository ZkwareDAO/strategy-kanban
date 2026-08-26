/**
 * 指标注册表
 * 统一管理所有技术指标
 */

import { BaseIndicator } from './base'
import { RSIndicator, type RSIParams } from './rsi'
import { MACDIndicator, type MACDParams } from './macd'
import { ATRIndicator, type ATRParams } from './atr'
import { EMAIndicator, type EMAParams } from './ema'
import { BOLLIndicator, type BOLLParams } from './boll'
import { KDIndicator, type KDParams } from './kd'
import { ADXIndicator, type ADXParams } from './adx'
import { OBVIndicator, type OBVParams } from './obv'
import { DonchianIndicator, type DonchianParams } from './donchian'
import { EnvelopeIndicator, type EnvelopeParams } from './envelope'
import { SMAIndicator, type SMAParams } from './sma'

export type IndicatorType = 'RSI' | 'MACD' | 'ATR' | 'EMA' | 'BOLL' | 'KD' | 'ADX' | 'OBV' | 'Donchian' | 'Envelope' | 'SMA'

export interface IndicatorFactoryParams {
  RSI?: RSIParams
  MACD?: MACDParams
  ATR?: ATRParams
  EMA?: EMAParams
  BOLL?: BOLLParams
  KD?: KDParams
  ADX?: ADXParams
  OBV?: OBVParams
  Donchian?: DonchianParams
  Envelope?: EnvelopeParams
  SMA?: SMAParams
}

const indicatorClasses = {
  RSI: RSIndicator,
  MACD: MACDIndicator,
  ATR: ATRIndicator,
  EMA: EMAIndicator,
  BOLL: BOLLIndicator,
  KD: KDIndicator,
  ADX: ADXIndicator,
  OBV: OBVIndicator,
  Donchian: DonchianIndicator,
  Envelope: EnvelopeIndicator,
  SMA: SMAIndicator,
} as const

export function createIndicator(
  type: IndicatorType,
  params?: IndicatorFactoryParams[IndicatorType]
): BaseIndicator {
  const IndicatorClass = indicatorClasses[type]
  if (!IndicatorClass) {
    throw new Error(`Unknown indicator type: ${type}`)
  }
  return new IndicatorClass(params)
}

export function createIndicators(
  types: IndicatorType[],
  params?: IndicatorFactoryParams
): BaseIndicator[] {
  return types
    .filter(type => type in indicatorClasses)
    .map(type => createIndicator(type, params?.[type]))
}

/**
 * 计算一组指标所需的预热 K线根数 = 各指标 [[BaseIndicator.warmupBars]] 的最大值。
 *
 * 同一张图上各指标窗口长短不一（短窗口指标几十根即收敛，长窗口指标可能要数百根），
 * 取最大值才能保证第一根可见 K线上**所有**指标都已有收敛值——否则短窗口指标先出现、
 * 长窗口指标仍留空白，正是本次要修的现象。
 *
 * @param types 已选指标
 * @param params 来自策略元数据的参数覆盖；缺省时各指标用自身默认参数
 * @returns 预热根数；未选任何指标时为 0
 */
export function warmupBarsFor(
  types: IndicatorType[],
  params?: IndicatorFactoryParams
): number {
  const indicators = createIndicators(types, params)
  if (indicators.length === 0) return 0
  return Math.max(...indicators.map(i => i.warmupBars))
}

export { BaseIndicator } from './base'
export * from './types'
export * from './config'
export * from './rsi'
export * from './macd'
export * from './atr'
export * from './ema'
export * from './boll'
export * from './kd'
export * from './adx'
export * from './obv'
export * from './donchian'
export * from './envelope'
export * from './sma'

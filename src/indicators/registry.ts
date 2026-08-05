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

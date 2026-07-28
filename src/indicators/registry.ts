/**
 * 指标注册表
 * 统一管理所有技术指标
 */

import { BaseIndicator } from './base'
import { RSIndicator, type RSIParams } from './rsi'
import { MACDIndicator, type MACDParams } from './macd'
import { ATRIndicator, type ATRParams } from './atr'
import { EMAIndicator, type EMAParams } from './ema'

export type IndicatorType = 'RSI' | 'MACD' | 'ATR' | 'EMA'

export interface IndicatorFactoryParams {
  RSI?: RSIParams
  MACD?: MACDParams
  ATR?: ATRParams
  EMA?: EMAParams
}

const indicatorClasses = {
  RSI: RSIndicator,
  MACD: MACDIndicator,
  ATR: ATRIndicator,
  EMA: EMAIndicator,
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
  return types.map(type => createIndicator(type, params?.[type]))
}

export { BaseIndicator } from './base'
export * from './types'
export * from './config'
export * from './rsi'
export * from './macd'
export * from './atr'
export * from './ema'

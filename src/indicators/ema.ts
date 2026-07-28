/**
 * EMA (Exponential Moving Average) 指数移动平均线
 */

import { BaseIndicator } from './base'
import type { KlinePoint, IndicatorResult, PlotlyTrace, IndicatorColors } from './types'

export interface EMAParams {
  fast_period?: number
  slow_period?: number
}

export class EMAIndicator extends BaseIndicator {
  name = 'EMA'
  subplot = false

  private fastPeriod: number
  private slowPeriod: number

  constructor(params: EMAParams = {}) {
    super()
    this.fastPeriod = params.fast_period ?? 48
    this.slowPeriod = params.slow_period ?? 120
  }

  compute(klineData: KlinePoint[]): IndicatorResult {
    const closes = klineData.map(d => d.close)
    const length = klineData.length

    const emaFast: (number | null)[] = new Array(length).fill(null)
    const emaSlow: (number | null)[] = new Array(length).fill(null)

    if (closes.length < this.fastPeriod) {
      return { ema_fast: emaFast, ema_slow: emaSlow }
    }

    const fastEMA = this.calculateEMA(closes, this.fastPeriod)
    for (let i = 0; i < length; i++) {
      emaFast[i] = fastEMA[i]
    }

    const slowEMA = this.calculateEMA(closes, this.slowPeriod)
    for (let i = 0; i < length; i++) {
      emaSlow[i] = slowEMA[i]
    }

    return { ema_fast: emaFast, ema_slow: emaSlow }
  }

  private calculateEMA(data: number[], period: number): (number | null)[] {
    const ema: (number | null)[] = new Array(data.length).fill(null)
    if (data.length < period) return ema

    let sum = 0
    for (let i = 0; i < period; i++) {
      sum += data[i]
    }
    ema[period - 1] = sum / period

    const multiplier = 2 / (period + 1)
    for (let i = period; i < data.length; i++) {
      ema[i] = (data[i] - ema[i - 1]!) * multiplier + ema[i - 1]!
    }

    return ema
  }

  getTraces(data: IndicatorResult, timestamps: string[], colors: IndicatorColors): PlotlyTrace[] {
    return [
      {
        x: timestamps,
        y: data.ema_fast,
        type: 'scatter',
        mode: 'lines',
        name: `EMA Fast(${this.fastPeriod})`,
        line: { color: colors.ema_fast_line, width: 2 },
        xaxis: 'x',
        yaxis: 'y',
        showlegend: true,
      },
      {
        x: timestamps,
        y: data.ema_slow,
        type: 'scatter',
        mode: 'lines',
        name: `EMA Slow(${this.slowPeriod})`,
        line: { color: colors.ema_slow_line, width: 2 },
        xaxis: 'x',
        yaxis: 'y',
        showlegend: true,
      },
    ]
  }
}
